import { describe, expect, it } from "vitest";

import {
  toWireMessage,
  toWireRelayEvent,
  toWireSnapshot,
} from "../src/websocket/ws-server.js";

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
});
