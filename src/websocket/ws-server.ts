import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

import type { Logger } from "../logging/logger.js";
import type { RelayService, RelayServerEvent } from "../relay/relay-service.js";
import type { NormalizedWechatMessage } from "../wechat/types.js";

const envelopeOnlySchema = z.object({
  type: z.enum(["ping", "get_snapshot"]),
  message: z.record(z.string(), z.unknown()).optional(),
});

const syncNowSchema = z
  .object({
    type: z.literal("sync_now"),
    token: z.string().optional(),
    message: z
      .object({
        token: z.string().optional(),
      })
      .optional(),
  })
  .transform((value) => ({
    type: value.type,
    token: value.message?.token ?? value.token,
  }));

const sendTextPayloadSchema = z
  .object({
    external_userid: z.string().min(1).optional(),
    touser: z.string().min(1).optional(),
    open_kfid: z.string().min(1),
    content: z.string().min(1),
    msgid: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.external_userid && !value.touser) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "external_userid or touser is required",
        path: ["external_userid"],
      });
    }
  });

const sendTextEnvelopePayloadSchema = z.object({
  external_userid: z.string().min(1).optional(),
  touser: z.string().min(1).optional(),
  open_kfid: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  msgid: z.string().optional(),
});

const sendTextSchema = z.object({
  type: z.literal("send_text"),
  external_userid: z.string().min(1).optional(),
  touser: z.string().min(1).optional(),
  open_kfid: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  msgid: z.string().optional(),
  message: sendTextEnvelopePayloadSchema.optional(),
});

type NormalizedWsCommand =
  | {
      type: "ping";
    }
  | {
      type: "get_snapshot";
    }
  | {
      type: "sync_now";
      token?: string;
    }
  | {
      type: "send_text";
      external_userid?: string;
      touser?: string;
      open_kfid: string;
      content: string;
      msgid?: string;
    };

function parseWebSocketCommand(raw: unknown): NormalizedWsCommand {
  const base = envelopeOnlySchema.safeParse(raw);
  if (base.success) {
    return {
      type: base.data.type,
    };
  }

  const syncNow = syncNowSchema.safeParse(raw);
  if (syncNow.success) {
    return syncNow.data;
  }

  const sendText = sendTextSchema.safeParse(raw);
  if (sendText.success) {
    const normalizedPayload = sendTextPayloadSchema.parse({
      external_userid:
        sendText.data.message?.external_userid ?? sendText.data.external_userid,
      touser: sendText.data.message?.touser ?? sendText.data.touser,
      open_kfid: sendText.data.message?.open_kfid ?? sendText.data.open_kfid,
      content: sendText.data.message?.content ?? sendText.data.content,
      msgid: sendText.data.message?.msgid ?? sendText.data.msgid,
    });

    return {
      type: "send_text",
      ...normalizedPayload,
    };
  }

  throw new Error("Unsupported websocket command payload");
}

function envelope<T extends Record<string, unknown>>(type: string, message: T) {
  return {
    type,
    message,
  };
}

export function toWireMessage(message: NormalizedWechatMessage) {
  return {
    message_id: message.messageId,
    open_kfid: message.openKfId,
    external_userid: message.externalUserId,
    send_time: message.sendTime,
    origin: message.origin,
    msgtype: message.msgType,
    text: message.text
      ? {
          content: message.text.content,
          menu_id: message.text.menuId,
        }
      : undefined,
    raw: message.raw,
  };
}

export function toWireSnapshot(snapshot: ReturnType<RelayService["getSnapshot"]>) {
  return {
    next_cursor: snapshot.nextCursor,
    recent_messages: snapshot.recentMessages.map(toWireMessage),
  };
}

export function toWireRelayEvent(event: RelayServerEvent) {
  if (event.type === "wechat.message") {
    return envelope(event.type, toWireMessage(event.message));
  }

  if (event.type === "wechat.sync.complete") {
    return envelope(event.type, {
      synced_count: event.syncedCount,
      next_cursor: event.nextCursor,
    });
  }

  if (event.type === "wechat.outbound.sent") {
    return envelope(event.type, {
      request: {
        external_userid: event.request.touser,
        open_kfid: event.request.open_kfid,
        content: event.request.content,
        msgid: event.request.msgid,
      },
      result: event.result,
    });
  }

  if (event.type === "wechat.callback") {
    return envelope(event.type, {
      to_user_name: event.callback.ToUserName,
      create_time: event.callback.CreateTime,
      msg_type: event.callback.MsgType,
      event: event.callback.Event,
      token: event.callback.Token,
      open_kf_id: event.callback.OpenKfId,
    });
  }

  return envelope(event.type, {
    error: event.message,
  });
}

export function createRelayWebSocketServer(input: {
  server: HttpServer;
  path: string;
  relayService: RelayService;
  logger: Logger;
}) {
  const sockets = new Map<string, WebSocket>();
  const wss = new WebSocketServer({
    server: input.server,
    path: input.path,
  });

  const send = (socket: WebSocket, payload: unknown) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  const broadcast = (payload: RelayServerEvent) => {
    for (const socket of sockets.values()) {
      send(socket, toWireRelayEvent(payload));
    }
  };

  wss.on("connection", (socket) => {
    const clientId = randomUUID();
    sockets.set(clientId, socket);
    input.logger.info("WebSocket client connected", {
      clientId,
      path: input.path,
      clientCount: sockets.size,
    });

    send(socket, {
      type: "connected",
      message: {
        client_id: clientId,
        ws_path: input.path,
      },
    });
    send(socket, envelope("snapshot", toWireSnapshot(input.relayService.getSnapshot())));

    socket.on("message", async (message) => {
      try {
        const raw = JSON.parse(message.toString());
        const command = parseWebSocketCommand(raw);
        input.logger.info("WebSocket command received", {
          clientId,
          commandType: command.type,
        });

        if (command.type === "ping") {
          send(socket, envelope("pong", {
            timestamp_ms: Date.now(),
          }));
          return;
        }

        if (command.type === "get_snapshot") {
          send(socket, envelope("snapshot", toWireSnapshot(input.relayService.getSnapshot())));
          return;
        }

        if (command.type === "sync_now") {
          const result = await input.relayService.syncNow({
            callbackToken: command.token,
          });
          send(socket, envelope("sync_now.result", {
            synced_count: result.syncedCount,
            next_cursor: result.nextCursor,
          }));
          return;
        }

        const result = await input.relayService.sendTextMessage({
          touser: command.external_userid ?? command.touser ?? "",
          openKfId: command.open_kfid,
          content: command.content,
          msgid: command.msgid,
        });
        send(socket, envelope("send_text.result", { ...result }));
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "Unknown websocket command error";
        input.logger.warn("WebSocket command failed", {
          clientId,
          error: messageText,
        });

        send(socket, envelope("error", {
          error: messageText,
        }));
      }
    });

    socket.on("close", () => {
      sockets.delete(clientId);
      input.logger.info("WebSocket client disconnected", {
        clientId,
        clientCount: sockets.size,
      });
    });
  });

  return {
    broadcast,
    getClientCount() {
      return sockets.size;
    },
    async close() {
      for (const socket of sockets.values()) {
        socket.close();
      }

      await new Promise<void>((resolve, reject) => {
        wss.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}
