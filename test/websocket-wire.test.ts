import { describe, expect, it } from "vitest";

import {
  createCommand,
  parseRelayCommand,
  parseRelayServerMessage,
  toWireMessage,
  toWireRelayEvent,
  toWireSnapshot,
} from "../src/shared/protocol.js";

describe("websocket wire protocol", () => {
  it("formats inbound messages as snake_case", () => {
    const wireMessage = toWireMessage({
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
    });

    expect(wireMessage).toMatchObject({
      message_id: "msg-1",
      open_kfid: "wk-1",
      external_userid: "wm-1",
      send_time: 123,
      msgtype: "text",
      text: {
        content: "hello",
        menu_id: "menu-1",
      },
    });
  });

  it("formats snapshot and relay events as snake_case", () => {
    const snapshot = toWireSnapshot({
      nextCursor: "cursor-1",
      subscribedOpenKfId: "wk-1",
      kfAccounts: [
        {
          openKfId: "wk-1",
          name: "Primary",
          avatar: "https://example.com/a.png",
        },
      ],
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
    const subscribed = toWireRelayEvent({
      type: "subscribed",
      openKfId: "wk-1",
    });
    const event = toWireRelayEvent({
      type: "wechat.sync.complete",
      syncedCount: 1,
      nextCursor: "cursor-1",
    });

    expect(snapshot).toMatchObject({
      next_cursor: "cursor-1",
      subscribed_open_kfid: "wk-1",
      kf_accounts: [
        {
          open_kfid: "wk-1",
          name: "Primary",
          avatar: "https://example.com/a.png",
        },
      ],
      recent_messages: [
        {
          message_id: "msg-1",
          open_kfid: "wk-1",
          external_userid: "wm-1",
        },
      ],
    });
    expect(subscribed).toEqual({
      type: "subscribed",
      message: {
        open_kfid: "wk-1",
      },
    });
    expect(event).toEqual({
      type: "wechat.sync.complete",
      message: {
        synced_count: 1,
        next_cursor: "cursor-1",
      },
    });
  });

  it("formats enter_session events and message_on_event commands", () => {
    const event = toWireRelayEvent({
      type: "wechat.enter_session",
      event: {
        eventType: "enter_session",
        openKfId: "wk-1",
        externalUserId: "wm-1",
        scene: "123",
        sceneParam: "abc",
        welcomeCode: "welcome-1",
        wechatChannels: {
          nickname: "video-account",
          scene: 1,
        },
        raw: {
          msgid: "event-1",
          open_kfid: "wk-1",
          external_userid: "wm-1",
          send_time: 123,
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
      },
    });

    expect(event).toEqual({
      type: "wechat.enter_session",
      message: {
        event_type: "enter_session",
        open_kfid: "wk-1",
        external_userid: "wm-1",
        scene: "123",
        scene_param: "abc",
        welcome_code: "welcome-1",
        wechat_channels: {
          nickname: "video-account",
          shop_nickname: undefined,
          scene: 1,
        },
        raw: {
          msgid: "event-1",
          open_kfid: "wk-1",
          external_userid: "wm-1",
          send_time: 123,
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
      },
    });

    expect(
      parseRelayCommand({
        type: "message_on_event",
        message: {
          code: "welcome-1",
          content: "欢迎咨询",
        },
      }),
    ).toEqual(
      createCommand("message_on_event", {
        code: "welcome-1",
        content: "欢迎咨询",
      }),
    );
  });

  it("normalizes supported websocket commands", () => {
    expect(
      parseRelayCommand({
        type: "subscribe",
        message: {
          open_kfid: "wk-1",
        },
      }),
    ).toEqual(
      createCommand("subscribe", {
        open_kfid: "wk-1",
      }),
    );

    expect(
      parseRelayCommand({
        type: "send_text",
        message: {
          external_userid: "wm-1",
          open_kfid: "wk-1",
          content: "hello",
        },
      }),
    ).toEqual(
      createCommand("send_text", {
        external_userid: "wm-1",
        open_kfid: "wk-1",
        content: "hello",
      }),
    );

    expect(
      parseRelayCommand({
        type: "sync_now",
        token: "sync-token",
      }),
    ).toEqual(
      createCommand("sync_now", {
        token: "sync-token",
      }),
    );
  });

  it("parses authenticated websocket envelopes", () => {
    expect(
      parseRelayServerMessage({
        type: "authenticated",
        message: {
          client_id: "client-1",
          ws_path: "/ws",
        },
      }),
    ).toEqual({
      type: "authenticated",
      message: {
        client_id: "client-1",
        ws_path: "/ws",
      },
    });
  });

  it("parses subscribed websocket envelopes", () => {
    expect(
      parseRelayServerMessage({
        type: "subscribed",
        message: {
          open_kfid: "wk-1",
        },
      }),
    ).toEqual({
      type: "subscribed",
      message: {
        open_kfid: "wk-1",
      },
    });
  });

  it("parses enter_session websocket envelopes", () => {
    expect(
      parseRelayServerMessage({
        type: "wechat.enter_session",
        message: {
          event_type: "enter_session",
          open_kfid: "wk-1",
          external_userid: "wm-1",
          scene: "123",
          scene_param: "abc",
          welcome_code: "welcome-1",
          wechat_channels: {
            nickname: "video-account",
            scene: 1,
          },
          raw: {
            msgid: "event-1",
          },
        },
      }),
    ).toEqual({
      type: "wechat.enter_session",
      message: {
        event_type: "enter_session",
        open_kfid: "wk-1",
        external_userid: "wm-1",
        scene: "123",
        scene_param: "abc",
        welcome_code: "welcome-1",
        wechat_channels: {
          nickname: "video-account",
          scene: 1,
        },
        raw: {
          msgid: "event-1",
        },
      },
    });
  });
});
