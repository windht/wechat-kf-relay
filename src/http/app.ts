import { randomUUID } from "node:crypto";

import express, { type Express } from "express";
import { ZodError, z } from "zod";

import type { AppConfig } from "../config.js";
import { serializeError } from "../logging/logger.js";
import type { RelayService } from "../relay/relay-service.js";
import { readServerKeyFromHttpRequest, isServerKeyAuthorized } from "../shared/auth.js";
import { toWireSnapshot } from "../shared/protocol.js";
import { decryptCallbackMessage, verifyCallbackUrl } from "../wechat/crypto.js";
import { parseCallbackEvent } from "../wechat/xml.js";

const callbackQuerySchema = z.object({
  msg_signature: z.string().min(1),
  timestamp: z.string().min(1),
  nonce: z.string().min(1),
  echostr: z.string().min(1).optional(),
});

const sendTextRequestSchema = z
  .object({
    touser: z.string().min(1).optional(),
    external_userid: z.string().min(1).optional(),
    openKfId: z.string().optional(),
    open_kfid: z.string().optional(),
    content: z.string().min(1).max(2048),
    msgid: z
      .string()
      .regex(/^[0-9A-Za-z_-]{1,32}$/)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.openKfId && !value.open_kfid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "open_kfid or openKfId is required",
        path: ["open_kfid"],
      });
    }
    if (!value.touser && !value.external_userid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "external_userid or touser is required",
        path: ["external_userid"],
      });
    }
  });

export function createApp(input: {
  config: AppConfig;
  relayService: RelayService;
  logger: import("../logging/logger.js").Logger;
  ready?: Promise<void>;
}): Express {
  const app = express();
  const ready = input.ready ?? Promise.resolve();

  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = Date.now();

    res.locals.requestId = requestId;
    input.logger.info("HTTP request started", {
      requestId,
      method: req.method,
      path: req.path,
      queryKeys: Object.keys(req.query),
    });
    res.on("finish", () => {
      input.logger.info("HTTP request completed", {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });

    next();
  });

  app.use(async (_req, _res, next) => {
    try {
      await ready;
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
    });
  });

  app.get(input.config.wechatCallbackPath, (req, res, next) => {
    try {
      const query = callbackQuerySchema.parse(req.query);

      if (!query.echostr) {
        input.logger.warn("Callback verification missing echostr", {
          requestId: res.locals.requestId as string | undefined,
        });
        res.status(400).json({
          error: "Missing echostr query parameter",
        });
        return;
      }

      const decrypted = verifyCallbackUrl({
        config: {
          token: input.config.wechat.token,
          encodingAesKey: input.config.wechat.encodingAesKey,
          receiveId: input.config.wechat.corpId,
        },
        msgSignature: query.msg_signature,
        timestamp: query.timestamp,
        nonce: query.nonce,
        echoStr: query.echostr,
      });
      input.logger.info("Callback URL verified", {
        requestId: res.locals.requestId as string | undefined,
      });

      res.type("text/plain").send(decrypted);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    input.config.wechatCallbackPath,
    express.text({ type: "*/*", limit: "1mb" }),
    async (req, res, next) => {
      try {
        const query = callbackQuerySchema.parse(req.query);
        const body = typeof req.body === "string" ? req.body : "";

        if (!body) {
          input.logger.warn("Callback POST missing XML body", {
            requestId: res.locals.requestId as string | undefined,
          });
          res.status(400).json({
            error: "Callback body must be XML text",
          });
          return;
        }

        const decrypted = await decryptCallbackMessage({
          config: {
            token: input.config.wechat.token,
            encodingAesKey: input.config.wechat.encodingAesKey,
            receiveId: input.config.wechat.corpId,
          },
          msgSignature: query.msg_signature,
          timestamp: query.timestamp,
          nonce: query.nonce,
          postData: body,
        });
        const callback = await parseCallbackEvent(decrypted);
        input.logger.info("Callback POST decrypted", {
          requestId: res.locals.requestId as string | undefined,
          event: callback.Event,
          msgType: callback.MsgType,
          hasSyncToken: Boolean(callback.Token),
        });

        await input.relayService.handleCallbackEvent(callback);

        res.type("text/plain").send("success");
      } catch (error) {
        next(error);
      }
    },
  );

  app.use("/api", (req, res, next) => {
    const serverKey = readServerKeyFromHttpRequest({
      headers: req.headers,
      query: req.query as Record<string, unknown>,
      body: req.body,
    });

    if (isServerKeyAuthorized(input.config.serverKey, serverKey)) {
      next();
      return;
    }

    input.logger.warn("Rejected unauthorized API request", {
      requestId: res.locals.requestId as string | undefined,
      method: req.method,
      path: req.path,
    });
    res.status(401).json({
      error: "Unauthorized",
    });
  });

  app.post("/api/messages/text", async (req, res, next) => {
    try {
      const body = sendTextRequestSchema.parse(req.body);
      const result = await input.relayService.sendTextMessage({
        touser: body.external_userid ?? body.touser ?? "",
        openKfId: body.openKfId ?? body.open_kfid ?? "",
        content: body.content,
        msgid: body.msgid,
      });
      input.logger.info("HTTP text send completed", {
        requestId: res.locals.requestId as string | undefined,
        externalUserId: body.external_userid ?? body.touser,
        openKfId: body.openKfId ?? body.open_kfid,
        msgid: result.msgid,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/wechat/sync", async (req, res, next) => {
    try {
      const token =
        typeof req.body?.token === "string" && req.body.token.length > 0
          ? req.body.token
          : undefined;
      const result = await input.relayService.syncNow({
        callbackToken: token,
      });
      input.logger.info("Manual sync completed", {
        requestId: res.locals.requestId as string | undefined,
        hasToken: Boolean(token),
        syncedCount: result.syncedCount,
        nextCursor: result.nextCursor,
      });

      res.json({
        synced_count: result.syncedCount,
        next_cursor: result.nextCursor,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/state", (_req, res) => {
    res.json(toWireSnapshot(input.relayService.getSnapshot()));
  });

  app.use(
    (
      error: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const statusCode = error instanceof ZodError ? 400 : 500;
      const message =
        error instanceof ZodError
          ? error.issues.map((issue) => issue.message).join(", ")
          : error instanceof Error
            ? error.message
            : "Unknown server error";
      input.logger.error("HTTP request failed", {
        requestId: res.locals.requestId as string | undefined,
        method: req.method,
        path: req.path,
        error: serializeError(error),
      });

      res.status(statusCode).json({
        error: message,
      });
    },
  );

  return app;
}
