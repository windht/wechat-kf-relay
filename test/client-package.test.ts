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
            msgid: "msg-ignored-1",
            open_kfid: "wk-2",
            external_userid: "wm-2",
            send_time: 121,
            origin: 3,
            msgtype: "text",
            text: {
              content: "hidden",
            },
          },
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
      .mockResolvedValueOnce({
        errcode: 0,
        errmsg: "ok",
        next_cursor: "cursor-3",
        has_more: 0,
        msg_list: [
          {
            msgid: "event-1",
            open_kfid: "wk-1",
            external_userid: "wm-1",
            send_time: 122,
            origin: 3,
            msgtype: "event",
            event: {
              event_type: "enter_session",
              open_kfid: "wk-1",
              external_userid: "wm-1",
              scene: "123",
              scene_param: "abc",
              welcome_code: "welcome-1",
            },
          },
          {
            msgid: "msg-2",
            open_kfid: "wk-1",
            external_userid: "wm-1",
            send_time: 124,
            origin: 3,
            msgtype: "text",
            text: {
              content: "subscribed",
            },
          },
          {
            msgid: "msg-ignored-2",
            open_kfid: "wk-2",
            external_userid: "wm-2",
            send_time: 125,
            origin: 3,
            msgtype: "text",
            text: {
              content: "hidden-again",
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
    const sendMessageOnEvent = vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      msgid: "event-out-1",
    });
    let nextCursor: string | undefined;

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
          return {
            nextCursor,
          };
        },
        async setNextCursor(cursor?: string) {
          nextCursor = cursor;
        },
      },
      apiClient: {
        syncMessages,
        sendTextMessage: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: "ok",
          msgid: "out-1",
        }),
        listAccounts: vi.fn().mockResolvedValue([
          {
            open_kfid: "wk-1",
            name: "Primary",
            avatar: "https://example.com/a.png",
          },
          {
            open_kfid: "wk-2",
            name: "Secondary",
            avatar: "https://example.com/b.png",
          },
        ]),
        sendMessageOnEvent,
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
      subscribed_open_kfid: undefined,
      kf_accounts: [
        {
          open_kfid: "wk-1",
          name: "Primary",
          avatar: "https://example.com/a.png",
        },
        {
          open_kfid: "wk-2",
          name: "Secondary",
          avatar: "https://example.com/b.png",
        },
      ],
      next_cursor: undefined,
      recent_messages: [],
    });

    const syncResult = once(client, "sync_now.result");
    client.syncNow("sync-token");

    const [receivedSyncResult] = await syncResult;

    expect(receivedSyncResult).toEqual({
      synced_count: 2,
      next_cursor: "cursor-2",
    });
    await expectNoEvent(client, "wechat.message");
    await expectNoEvent(client, "wechat.enter_session");

    const subscribed = once(client, "subscribed");
    const subscribedSnapshot = once(client, "snapshot");
    client.subscribeTo("wk-1");

    const [subscribedMessage] = await subscribed;
    const [scopedSnapshot] = await subscribedSnapshot;

    expect(subscribedMessage).toEqual({
      open_kfid: "wk-1",
    });
    expect(scopedSnapshot).toEqual({
      next_cursor: "cursor-2",
      subscribed_open_kfid: "wk-1",
      kf_accounts: [
        {
          open_kfid: "wk-1",
          name: "Primary",
          avatar: "https://example.com/a.png",
        },
        {
          open_kfid: "wk-2",
          name: "Secondary",
          avatar: "https://example.com/b.png",
        },
      ],
      recent_messages: [
        expect.objectContaining({
          message_id: "msg-1",
          open_kfid: "wk-1",
        }),
      ],
    });

    const receivedMessageIds: string[] = [];
    client.on("wechat.message", (message) => {
      receivedMessageIds.push(message.message_id);
    });

    const enterSession = once(client, "wechat.enter_session");
    const wechatMessage = once(client, "wechat.message");
    const secondSyncResult = once(client, "sync_now.result");
    client.syncNow("sync-token-2");

    const [receivedEnterSession] = await enterSession;
    const [receivedWechatMessage] = await wechatMessage;
    const [receivedSecondSyncResult] = await secondSyncResult;

    expect(receivedEnterSession).toMatchObject({
      event_type: "enter_session",
      open_kfid: "wk-1",
      external_userid: "wm-1",
      welcome_code: "welcome-1",
    });
    expect(receivedWechatMessage).toMatchObject({
      message_id: "msg-2",
      open_kfid: "wk-1",
      external_userid: "wm-1",
    });
    expect(receivedSecondSyncResult).toEqual({
      synced_count: 3,
      next_cursor: "cursor-3",
    });
    expect(receivedMessageIds).toEqual(["msg-2"]);

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

    const sendTextError = once(client, "relay.error");
    client.sendText({
      external_userid: "wm-1",
      open_kfid: "wk-2",
      content: "wrong kf",
    });

    const [sendTextErrorMessage] = await sendTextError;

    expect(sendTextErrorMessage.error).toContain("subscribed open_kfid");

    const messageOnEventResult = once(client, "message_on_event.result");
    client.messageOnEvent({
      code: "welcome-1",
      content: "欢迎咨询",
    });

    const [messageOnEventResultMessage] = await messageOnEventResult;

    expect(sendMessageOnEvent).toHaveBeenCalledWith({
      code: "welcome-1",
      content: "欢迎咨询",
      msgid: undefined,
    });
    expect(messageOnEventResultMessage).toEqual({
      errcode: 0,
      errmsg: "ok",
      msgid: "event-out-1",
    });

    client.disconnect();
  });
});

async function expectNoEvent(
  client: WechatKfRelayClient,
  eventName: keyof import("../src/client/index.js").RelayClientEventMap,
  timeoutMs = 100,
) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off(eventName, onEvent as never);
      resolve();
    }, timeoutMs);

    const onEvent = () => {
      clearTimeout(timer);
      client.off(eventName, onEvent as never);
      reject(new Error(`Unexpected ${String(eventName)} event`));
    };

    client.on(eventName, onEvent as never);
  });
}
