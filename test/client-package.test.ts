import { once } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import WechatKfRelayClient from "../src/client/index.js";
import { noopLogger } from "../src/logging/logger.js";
import WechatKfRelay from "../src/server/index.js";

describe("WechatKfRelay client package", () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      await cleanup.pop()?.();
    }
  });

  it("authenticates and emits typed relay events", async () => {
    const syncMessages = vi
      .fn()
      .mockResolvedValueOnce({
        errcode: 0,
        errmsg: "ok",
        next_cursor: "cursor-2",
        has_more: 0,
        msg_list: [
          {
            msgid: "msg-1",
            open_kfid: "wk-1",
            external_userid: "wm-1",
            send_time: 123,
            origin: 3,
            msgtype: "text",
            text: {
              content: "hello",
            },
          },
        ],
      })
      .mockResolvedValue({
        errcode: 0,
        errmsg: "ok",
        has_more: 0,
        msg_list: [],
      });

    const relay = new WechatKfRelay({
      host: "127.0.0.1",
      port: 0,
      wsPath: "/ws",
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
        syncMessages,
        sendTextMessage: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: "ok",
          msgid: "out-1",
        }),
      },
    });
    const serverInfo = await relay.start();
    cleanup.push(async () => {
      await relay.stop();
    });

    const client = new WechatKfRelayClient({
      url: serverInfo.wsUrl,
      key: "relay-secret",
    });

    const authenticated = once(client, "authenticated");
    const snapshot = once(client, "snapshot");
    client.connect();

    const [authenticatedMessage] = await authenticated;
    const [snapshotMessage] = await snapshot;

    expect(authenticatedMessage).toMatchObject({
      client_id: expect.any(String),
      ws_path: "/ws",
    });
    expect(snapshotMessage).toEqual({
      next_cursor: undefined,
      recent_messages: [],
    });

    const wechatMessage = once(client, "wechat.message");
    const syncResult = once(client, "sync_now.result");
    client.syncNow("sync-token");

    const [receivedWechatMessage] = await wechatMessage;
    const [receivedSyncResult] = await syncResult;

    expect(receivedWechatMessage).toMatchObject({
      message_id: "msg-1",
      open_kfid: "wk-1",
      external_userid: "wm-1",
    });
    expect(receivedSyncResult).toEqual({
      synced_count: 1,
      next_cursor: "cursor-2",
    });

    const outboundSent = once(client, "wechat.outbound.sent");
    const sendTextResult = once(client, "send_text.result");
    client.sendText({
      external_userid: "wm-1",
      open_kfid: "wk-1",
      content: "pong",
    });

    const [outboundSentMessage] = await outboundSent;
    const [sendTextResultMessage] = await sendTextResult;

    expect(outboundSentMessage).toEqual({
      request: {
        external_userid: "wm-1",
        touser: "wm-1",
        open_kfid: "wk-1",
        content: "pong",
        msgid: undefined,
      },
      result: {
        msgid: "out-1",
      },
    });
    expect(sendTextResultMessage).toEqual({
      errcode: 0,
      errmsg: "ok",
      msgid: "out-1",
    });

    client.disconnect();
  });
});
