import http from "node:http";

import express from "express";
import request from "supertest";
import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";

import WechatKfRelay from "../src/server/index.js";
import { noopLogger } from "../src/logging/logger.js";
import { RELAY_SERVER_KEY_HEADER } from "../src/shared/auth.js";

describe("WechatKfRelay server package", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it("returns a mountable handler and protects API + websocket access", async () => {
    const relay = createRelay({
      wsPath: "/relay/ws",
    });
    const app = express();
    app.use("/relay", relay.handler());

    const server = http.createServer(app);
    relay.attach(server);
    await listen(server);

    cleanup.push(async () => {
      await relay.stop();
      await closeServer(server);
    });

    const port = getPort(server);
    const baseUrl = `http://127.0.0.1:${port}`;

    const unauthorizedState = await request(baseUrl).get("/relay/api/state");
    const authorizedState = await request(baseUrl)
      .get("/relay/api/state")
      .set(RELAY_SERVER_KEY_HEADER, "relay-secret");

    expect(typeof relay.handler()).toBe("function");
    expect(unauthorizedState.status).toBe(401);
    expect(authorizedState.status).toBe(200);
    expect(authorizedState.body).toEqual({
      next_cursor: undefined,
      recent_messages: [],
    });

    const unexpectedResponse = await connectWithUnexpectedResponse(
      `ws://127.0.0.1:${port}/relay/ws`,
    );
    expect(unexpectedResponse.statusCode).toBe(401);

    const authorizedMessages = await connectAndCollectMessages(
      `ws://127.0.0.1:${port}/relay/ws`,
      "relay-secret",
      2,
    );

    expect(authorizedMessages[0]).toMatchObject({
      type: "authenticated",
      message: {
        ws_path: "/relay/ws",
      },
    });
    expect(authorizedMessages[1]).toEqual({
      type: "snapshot",
      message: {
        next_cursor: undefined,
        recent_messages: [],
      },
    });
  });
});

function createRelay(overrides: Partial<ConstructorParameters<typeof WechatKfRelay>[0]> = {}) {
  return new WechatKfRelay({
    host: "127.0.0.1",
    port: 0,
    wsPath: "/ws",
    wechatCallbackPath: "/wechat/callback",
    corpId: "ww123",
    secret: "secret",
    token: "Token123",
    encodingAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
    serverKey: "relay-secret",
    logger: noopLogger,
    stateStore: {
      async init() {},
      getState() {
        return {};
      },
      async setNextCursor() {},
    },
    apiClient: {
      syncMessages: vi.fn().mockResolvedValue({
        errcode: 0,
        errmsg: "ok",
        has_more: 0,
        msg_list: [],
      }),
      sendTextMessage: vi.fn().mockResolvedValue({
        errcode: 0,
        errmsg: "ok",
        msgid: "sent-1",
      }),
    },
    ...overrides,
  });
}

function listen(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
}

function closeServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getPort(server: http.Server) {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP server address");
  }

  return address.port;
}

function connectWithUnexpectedResponse(url: string) {
  return new Promise<http.IncomingMessage>((resolve, reject) => {
    const socket = new WebSocket(url);

    socket.once("unexpected-response", (_request, response) => {
      socket.close();
      resolve(response);
    });
    socket.once("error", reject);
  });
}

function connectAndCollectMessages(url: string, key: string, count: number) {
  return new Promise<any[]>((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: {
        [RELAY_SERVER_KEY_HEADER]: key,
      },
    });
    const messages: any[] = [];

    socket.on("message", (raw) => {
      messages.push(JSON.parse(raw.toString()));
      if (messages.length >= count) {
        socket.close();
        resolve(messages);
      }
    });
    socket.once("error", reject);
  });
}
