import { describe, expect, it, vi } from "vitest";

import { noopLogger } from "../src/logging/logger.js";
import { RelayService } from "../src/relay/relay-service.js";

describe("RelayService", () => {
  it("broadcasts synced messages and updates the cursor", async () => {
    const broadcast = vi.fn();
    const setNextCursor = vi.fn();
    const sendTextMessage = vi.fn();
    const sendMessageOnEvent = vi.fn();
    const relayService = new RelayService({
      apiClient: {
        syncMessages: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: "ok",
          next_cursor: "cursor-2",
          has_more: 0,
          msg_list: [
            {
              msgid: "msg-1",
              open_kfid: "kf-1",
              external_userid: "user-1",
              send_time: 123,
              origin: 3,
              msgtype: "text",
              text: {
                content: "hello",
              },
            },
          ],
        }),
        sendTextMessage,
        sendMessageOnEvent,
      } as never,
      stateStore: {
        getState: () => ({
          nextCursor: "cursor-1",
        }),
        setNextCursor,
      } as never,
      broadcast,
      logger: noopLogger,
      echoTest: {
        enabled: false,
        prefix: "",
      },
    });

    const result = await relayService.syncNow({
      callbackToken: "sync-token",
    });

    expect(result).toEqual({
      syncedCount: 1,
      nextCursor: "cursor-2",
    });
    expect(setNextCursor).toHaveBeenCalledWith("cursor-2");
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "wechat.message",
      }),
    );
    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(sendMessageOnEvent).not.toHaveBeenCalled();
  });

  it("echoes inbound customer text when echo test is enabled", async () => {
    const sendTextMessage = vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      msgid: "echo-msg-1",
    });
    const relayService = new RelayService({
      apiClient: {
        syncMessages: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: "ok",
          next_cursor: "cursor-2",
          has_more: 0,
          msg_list: [
            {
              msgid: "msg-1",
              open_kfid: "kf-1",
              external_userid: "user-1",
              send_time: 123,
              origin: 3,
              msgtype: "text",
              text: {
                content: "hello",
              },
            },
          ],
        }),
        sendTextMessage,
        sendMessageOnEvent: vi.fn(),
      } as never,
      stateStore: {
        getState: () => ({
          nextCursor: "cursor-1",
        }),
        setNextCursor: vi.fn(),
      } as never,
      broadcast: vi.fn(),
      logger: noopLogger,
      echoTest: {
        enabled: true,
        prefix: "[echo] ",
      },
    });

    await relayService.syncNow({
      callbackToken: "sync-token",
    });

    expect(sendTextMessage).toHaveBeenCalledWith({
      touser: "user-1",
      openKfId: "kf-1",
      content: "[echo] hello",
    });
  });

  it("broadcasts enter_session events separately from recent messages", async () => {
    const broadcast = vi.fn();
    let nextCursor = "cursor-1";
    const relayService = new RelayService({
      apiClient: {
        syncMessages: vi.fn().mockResolvedValue({
          errcode: 0,
          errmsg: "ok",
          next_cursor: "cursor-2",
          has_more: 0,
          msg_list: [
            {
              msgid: "event-1",
              open_kfid: "kf-1",
              external_userid: "user-1",
              send_time: 123,
              origin: 3,
              msgtype: "event",
              event: {
                event_type: "enter_session",
                open_kfid: "kf-1",
                external_userid: "user-1",
                scene: "123",
                scene_param: "abc",
                welcome_code: "welcome-1",
                wechat_channels: {
                  nickname: "video-account",
                  scene: 1,
                },
              },
            },
          ],
        }),
        sendTextMessage: vi.fn(),
        sendMessageOnEvent: vi.fn(),
      } as never,
      stateStore: {
        getState: () => ({
          nextCursor,
        }),
        setNextCursor: vi.fn(async (cursor?: string) => {
          nextCursor = cursor ?? "";
        }),
      } as never,
      broadcast,
      logger: noopLogger,
      echoTest: {
        enabled: false,
        prefix: "",
      },
    });

    const result = await relayService.syncNow({
      callbackToken: "sync-token",
    });

    expect(result).toEqual({
      syncedCount: 1,
      nextCursor: "cursor-2",
    });
    expect(broadcast).toHaveBeenCalledWith({
      type: "wechat.enter_session",
      event: {
        eventType: "enter_session",
        openKfId: "kf-1",
        externalUserId: "user-1",
        scene: "123",
        sceneParam: "abc",
        welcomeCode: "welcome-1",
        wechatChannels: {
          nickname: "video-account",
          shopNickname: undefined,
          scene: 1,
        },
        raw: {
          msgid: "event-1",
          open_kfid: "kf-1",
          external_userid: "user-1",
          send_time: 123,
          origin: 3,
          msgtype: "event",
          event: {
            event_type: "enter_session",
            open_kfid: "kf-1",
            external_userid: "user-1",
            scene: "123",
            scene_param: "abc",
            welcome_code: "welcome-1",
            wechat_channels: {
              nickname: "video-account",
              scene: 1,
            },
          },
        },
      },
    });
    expect(relayService.getSnapshot()).toEqual({
      nextCursor: "cursor-2",
      recentMessages: [],
    });
  });

  it("forwards message_on_event replies to the API client", async () => {
    const sendMessageOnEvent = vi.fn().mockResolvedValue({
      errcode: 0,
      errmsg: "ok",
      msgid: "event-msg-1",
    });
    const relayService = new RelayService({
      apiClient: {
        syncMessages: vi.fn(),
        sendTextMessage: vi.fn(),
        sendMessageOnEvent,
      } as never,
      stateStore: {
        getState: () => ({}),
        setNextCursor: vi.fn(),
      } as never,
      broadcast: vi.fn(),
      logger: noopLogger,
      echoTest: {
        enabled: false,
        prefix: "",
      },
    });

    const result = await relayService.sendMessageOnEvent({
      code: "welcome-1",
      content: "欢迎咨询",
      msgid: "custom-1",
    });

    expect(sendMessageOnEvent).toHaveBeenCalledWith({
      code: "welcome-1",
      content: "欢迎咨询",
      msgid: "custom-1",
    });
    expect(result).toEqual({
      errcode: 0,
      errmsg: "ok",
      msgid: "event-msg-1",
    });
  });
});
