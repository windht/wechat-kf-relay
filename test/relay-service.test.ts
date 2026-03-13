import { describe, expect, it, vi } from "vitest";

import { noopLogger } from "../src/logging/logger.js";
import { RelayService } from "../src/relay/relay-service.js";

describe("RelayService", () => {
  it("broadcasts synced messages and updates the cursor", async () => {
    const broadcast = vi.fn();
    const setNextCursor = vi.fn();
    const sendTextMessage = vi.fn();
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
});
