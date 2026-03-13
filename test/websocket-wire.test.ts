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
    const event = toWireRelayEvent({
      type: "wechat.sync.complete",
      syncedCount: 1,
      nextCursor: "cursor-1",
    });

    expect(snapshot).toMatchObject({
      next_cursor: "cursor-1",
      recent_messages: [
        {
          message_id: "msg-1",
          open_kfid: "wk-1",
          external_userid: "wm-1",
        },
      ],
    });
    expect(event).toEqual({
      type: "wechat.sync.complete",
      message: {
        synced_count: 1,
        next_cursor: "cursor-1",
      },
    });
  });

  it("normalizes supported websocket commands", () => {
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
});
