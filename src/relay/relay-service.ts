import type { Logger } from "../logging/logger.js";
import type { RelayStateStore } from "./state-store.js";
import type {
  NormalizedWechatMessage,
  SendTextInput,
  WechatCallbackEvent,
  WechatSyncMessage,
} from "../wechat/types.js";
import type { RelayApiClient } from "../wechat/api.js";

export type RelayServerEvent =
  | {
      type: "wechat.callback";
      callback: WechatCallbackEvent;
    }
  | {
      type: "wechat.message";
      message: NormalizedWechatMessage;
    }
  | {
      type: "wechat.sync.complete";
      syncedCount: number;
      nextCursor?: string;
    }
  | {
      type: "wechat.outbound.sent";
      request: Omit<SendTextInput, "openKfId"> & { open_kfid: string };
      result: {
        msgid?: string;
      };
    }
  | {
      type: "relay.error";
      message: string;
    };

export class RelayService {
  private readonly recentMessages: NormalizedWechatMessage[] = [];

  constructor(
    private readonly deps: {
      apiClient: RelayApiClient;
      stateStore: RelayStateStore;
      broadcast: (event: RelayServerEvent) => void;
      logger: Logger;
      echoTest: {
        enabled: boolean;
        prefix: string;
      };
    },
  ) {}

  async handleCallbackEvent(callback: WechatCallbackEvent) {
    this.deps.logger.info("Received decrypted callback event", {
      event: callback.Event,
      msgType: callback.MsgType,
      openKfId: callback.OpenKfId,
      hasSyncToken: Boolean(callback.Token),
    });
    this.deps.broadcast({
      type: "wechat.callback",
      callback,
    });

    return this.syncNow({
      callbackToken: callback.Token,
    });
  }

  async syncNow(input: { callbackToken?: string } = {}) {
    const state = this.deps.stateStore.getState();
    let cursor = state.nextCursor;
    let hasMore = true;
    let syncedCount = 0;
    let batchCount = 0;

    this.deps.logger.info("Starting relay sync", {
      initialCursor: cursor,
      hasCallbackToken: Boolean(input.callbackToken),
    });

    while (hasMore) {
      batchCount += 1;
      const response = await this.deps.apiClient.syncMessages({
        cursor,
        token: input.callbackToken,
      });

      cursor = response.next_cursor;
      await this.deps.stateStore.setNextCursor(cursor);
      this.deps.logger.info("Processed sync batch", {
        batch: batchCount,
        nextCursor: cursor,
        hasMore: response.has_more === 1,
        batchMessageCount: response.msg_list?.length ?? 0,
      });

      for (const message of response.msg_list ?? []) {
        const normalized = normalizeMessage(message);
        this.pushRecentMessage(normalized);
        syncedCount += 1;
        this.deps.logger.info("Relaying inbound WeChat message", {
          messageId: normalized.messageId,
          openKfId: normalized.openKfId,
          externalUserId: normalized.externalUserId,
          msgType: normalized.msgType,
          origin: normalized.origin,
          textPreview: normalized.text?.content?.slice(0, 120),
        });
        this.deps.broadcast({
          type: "wechat.message",
          message: normalized,
        });
        await this.maybeEchoMessage(normalized);
      }

      hasMore = response.has_more === 1;
    }

    const event: RelayServerEvent = {
      type: "wechat.sync.complete",
      syncedCount,
      nextCursor: cursor,
    };
    this.deps.broadcast(event);
    this.deps.logger.info("Relay sync complete", {
      syncedCount,
      nextCursor: cursor,
      batches: batchCount,
    });

    return {
      syncedCount,
      nextCursor: cursor,
    };
  }

  async sendTextMessage(input: SendTextInput) {
    this.deps.logger.info("Sending outbound relay text message", {
      touser: input.touser,
      openKfId: input.openKfId,
      hasMsgId: Boolean(input.msgid),
      contentLength: Buffer.byteLength(input.content, "utf8"),
      textPreview: input.content.slice(0, 120),
    });
    const result = await this.deps.apiClient.sendTextMessage(input);

    this.deps.broadcast({
      type: "wechat.outbound.sent",
      request: {
        touser: input.touser,
        open_kfid: input.openKfId,
        content: input.content,
        msgid: input.msgid,
      },
      result: {
        msgid: result.msgid,
      },
    });
    this.deps.logger.info("Outbound relay text message sent", {
      touser: input.touser,
      openKfId: input.openKfId,
      msgid: result.msgid,
    });

    return result;
  }

  getSnapshot() {
    return {
      nextCursor: this.deps.stateStore.getState().nextCursor,
      recentMessages: [...this.recentMessages],
    };
  }

  private pushRecentMessage(message: NormalizedWechatMessage) {
    this.recentMessages.unshift(message);

    if (this.recentMessages.length > 100) {
      this.recentMessages.length = 100;
    }
  }

  private async maybeEchoMessage(message: NormalizedWechatMessage) {
    if (!this.deps.echoTest.enabled) {
      return;
    }

    if (message.origin !== 3 || message.msgType !== "text" || !message.text?.content) {
      return;
    }

    const echoedContent = `${this.deps.echoTest.prefix}${message.text.content}`;
    this.deps.logger.info("Echo test enabled; echoing inbound text message", {
      messageId: message.messageId,
      openKfId: message.openKfId,
      externalUserId: message.externalUserId,
      echoedLength: Buffer.byteLength(echoedContent, "utf8"),
    });

    try {
      await this.sendTextMessage({
        touser: message.externalUserId,
        openKfId: message.openKfId,
        content: echoedContent,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.deps.logger.error("Echo test send failed", {
        messageId: message.messageId,
        openKfId: message.openKfId,
        externalUserId: message.externalUserId,
        error: messageText,
      });
    }
  }
}

function normalizeMessage(message: WechatSyncMessage): NormalizedWechatMessage {
  return {
    messageId: message.msgid,
    openKfId: message.open_kfid,
    externalUserId: message.external_userid,
    sendTime: message.send_time,
    origin: message.origin,
    msgType: message.msgtype,
    text: message.text
      ? {
          content: message.text.content,
          menuId: message.text.menu_id,
        }
      : undefined,
    raw: message,
  };
}
