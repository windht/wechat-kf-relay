import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/http/app.js";
import { noopLogger } from "../src/logging/logger.js";

describe("createApp", () => {
  it("returns ok from the health endpoint", async () => {
    const app = createApp({
      config: {
        host: "127.0.0.1",
        port: 3000,
        log: {
          level: "info",
          file: ".data/test-relay.log",
        },
        echoTest: {
          enabled: false,
          prefix: "",
        },
        wsPath: "/ws",
        wechatCallbackPath: "/wechat/callback",
        stateFile: ".data/test-state.json",
        wechatApiBaseUrl: "https://qyapi.weixin.qq.com",
        wechat: {
          corpId: "ww123",
          secret: "secret",
          token: "Token123",
          encodingAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
        },
      },
      relayService: {
        handleCallbackEvent: vi.fn(),
        sendTextMessage: vi.fn(),
        syncNow: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({
          nextCursor: undefined,
          recentMessages: [],
        }),
      } as never,
      logger: noopLogger,
    });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
    });
  });

  it("returns snake_case state snapshot and sync response", async () => {
    const app = createApp({
      config: {
        host: "127.0.0.1",
        port: 3000,
        log: {
          level: "info",
          file: ".data/test-relay.log",
        },
        echoTest: {
          enabled: false,
          prefix: "",
        },
        wsPath: "/ws",
        wechatCallbackPath: "/wechat/callback",
        stateFile: ".data/test-state.json",
        wechatApiBaseUrl: "https://qyapi.weixin.qq.com",
        wechat: {
          corpId: "ww123",
          secret: "secret",
          token: "Token123",
          encodingAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
        },
      },
      relayService: {
        handleCallbackEvent: vi.fn(),
        sendTextMessage: vi.fn(),
        syncNow: vi.fn().mockResolvedValue({
          syncedCount: 2,
          nextCursor: "cursor-2",
        }),
        getSnapshot: vi.fn().mockReturnValue({
          nextCursor: "cursor-1",
          recentMessages: [
            {
              messageId: "msg-1",
              openKfId: "wk-1",
              externalUserId: "wm-1",
              sendTime: 123,
              origin: 3,
              msgType: "text",
              text: {
                content: "hello",
                menuId: "menu-1",
              },
              raw: {
                msgid: "msg-1",
                open_kfid: "wk-1",
                external_userid: "wm-1",
                send_time: 123,
                origin: 3,
                msgtype: "text",
              },
            },
          ],
        }),
      } as never,
      logger: noopLogger,
    });

    const stateResponse = await request(app).get("/api/state");
    const syncResponse = await request(app)
      .post("/api/wechat/sync")
      .send({});

    expect(stateResponse.status).toBe(200);
    expect(stateResponse.body).toEqual({
      next_cursor: "cursor-1",
      recent_messages: [
        {
          message_id: "msg-1",
          open_kfid: "wk-1",
          external_userid: "wm-1",
          send_time: 123,
          origin: 3,
          msgtype: "text",
          text: {
            content: "hello",
            menu_id: "menu-1",
          },
          raw: {
            msgid: "msg-1",
            open_kfid: "wk-1",
            external_userid: "wm-1",
            send_time: 123,
            origin: 3,
            msgtype: "text",
          },
        },
      ],
    });
    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body).toEqual({
      synced_count: 2,
      next_cursor: "cursor-2",
    });
  });
});
