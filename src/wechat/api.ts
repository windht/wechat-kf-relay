import type {
  SendMessageOnEventInput,
  SendTextInput,
  WechatSendResponse,
  WechatSyncResponse,
} from "./types.js";
import type { Logger } from "../logging/logger.js";

interface AccessTokenResponse {
  errcode: number;
  errmsg: string;
  access_token?: string;
  expires_in?: number;
}

interface WechatApiConfig {
  baseUrl: string;
  corpId: string;
  secret: string;
}

export interface RelayApiClient {
  syncMessages(input: {
    cursor?: string;
    token?: string;
    limit?: number;
    voiceFormat?: 0 | 1;
  }): Promise<WechatSyncResponse>;
  sendTextMessage(input: SendTextInput): Promise<WechatSendResponse>;
  sendMessageOnEvent(input: SendMessageOnEventInput): Promise<WechatSendResponse>;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

function redactTokenPreview(token: string) {
  if (token.length <= 8) {
    return "***";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function buildTextReplyPayload(input: SendTextInput) {
  return {
    touser: input.touser,
    open_kfid: input.openKfId,
    msgid: input.msgid,
    msgtype: "text",
    text: {
      content: input.content,
    },
  };
}

export function buildEventReplyPayload(input: SendMessageOnEventInput) {
  return {
    code: input.code,
    msgid: input.msgid,
    msgtype: "text",
    text: {
      content: input.content,
    },
  };
}

export class WechatKfApiClient implements RelayApiClient {
  private cachedToken: CachedToken | undefined;

  constructor(
    private readonly config: WechatApiConfig,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getAccessToken(forceRefresh = false) {
    const now = Date.now();

    if (!forceRefresh && this.cachedToken && this.cachedToken.expiresAt > now) {
      this.logger.debug("Using cached access token");
      return this.cachedToken.value;
    }

    const url = new URL("/cgi-bin/gettoken", this.config.baseUrl);
    url.searchParams.set("corpid", this.config.corpId);
    url.searchParams.set("corpsecret", this.config.secret);

    this.logger.info("Fetching WeChat access token");
    const response = await this.fetchImpl(url, {
      method: "GET",
    });
    const payload = (await response.json()) as AccessTokenResponse;

    if (!response.ok) {
      throw new Error(`Failed to fetch access token: HTTP ${response.status}`);
    }

    if (payload.errcode !== 0 || !payload.access_token || !payload.expires_in) {
      throw new Error(
        `Failed to fetch access token: ${payload.errcode} ${payload.errmsg}`,
      );
    }

    this.cachedToken = {
      value: payload.access_token,
      expiresAt: now + Math.max(payload.expires_in - 300, 60) * 1000,
    };
    this.logger.info("Fetched WeChat access token", {
      expiresInSeconds: payload.expires_in,
      accessToken: redactTokenPreview(payload.access_token),
    });

    return this.cachedToken.value;
  }

  async syncMessages(input: {
    cursor?: string;
    token?: string;
    limit?: number;
    voiceFormat?: 0 | 1;
  }) {
    const accessToken = await this.getAccessToken();
    const url = new URL("/cgi-bin/kf/sync_msg", this.config.baseUrl);
    url.searchParams.set("access_token", accessToken);
    this.logger.info("Calling WeChat kf/sync_msg", {
      cursor: input.cursor,
      hasCallbackToken: Boolean(input.token),
      limit: input.limit ?? 1000,
      voiceFormat: input.voiceFormat ?? 0,
    });

    const payload = await this.postJson<WechatSyncResponse>(url, {
      cursor: input.cursor,
      token: input.token,
      limit: input.limit ?? 1000,
      voice_format: input.voiceFormat ?? 0,
    });

    if (payload.errcode !== 0) {
      throw new Error(`kf/sync_msg failed: ${payload.errcode} ${payload.errmsg}`);
    }

    this.logger.info("WeChat kf/sync_msg completed", {
      nextCursor: payload.next_cursor,
      hasMore: payload.has_more,
      messageCount: payload.msg_list?.length ?? 0,
    });

    return payload;
  }

  async sendTextMessage(input: SendTextInput) {
    const accessToken = await this.getAccessToken();
    const url = new URL("/cgi-bin/kf/send_msg", this.config.baseUrl);
    url.searchParams.set("access_token", accessToken);
    this.logger.info("Calling WeChat kf/send_msg", {
      touser: input.touser,
      openKfId: input.openKfId,
      hasMsgId: Boolean(input.msgid),
      contentLength: Buffer.byteLength(input.content, "utf8"),
    });

    const payload = await this.postJson<WechatSendResponse>(
      url,
      buildTextReplyPayload(input),
    );

    if (payload.errcode !== 0) {
      throw new Error(`kf/send_msg failed: ${payload.errcode} ${payload.errmsg}`);
    }

    this.logger.info("WeChat kf/send_msg completed", {
      msgid: payload.msgid,
    });

    return payload;
  }

  async sendMessageOnEvent(input: SendMessageOnEventInput) {
    const accessToken = await this.getAccessToken();
    const url = new URL("/cgi-bin/kf/send_msg_on_event", this.config.baseUrl);
    url.searchParams.set("access_token", accessToken);
    this.logger.info("Calling WeChat kf/send_msg_on_event", {
      code: redactTokenPreview(input.code),
      hasMsgId: Boolean(input.msgid),
      contentLength: Buffer.byteLength(input.content, "utf8"),
    });

    const payload = await this.postJson<WechatSendResponse>(
      url,
      buildEventReplyPayload(input),
    );

    if (payload.errcode !== 0) {
      throw new Error(
        `kf/send_msg_on_event failed: ${payload.errcode} ${payload.errmsg}`,
      );
    }

    this.logger.info("WeChat kf/send_msg_on_event completed", {
      msgid: payload.msgid,
    });

    return payload;
  }

  private async postJson<T>(url: URL, body: Record<string, unknown>) {
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(
        Object.fromEntries(
          Object.entries(body).filter(([, value]) => value !== undefined),
        ),
      ),
    });

    if (!response.ok) {
      throw new Error(`Wechat API request failed: HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
