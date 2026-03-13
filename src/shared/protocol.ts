import { z } from "zod";

import type { RelayServerEvent } from "../relay/relay-service.js";
import type {
  NormalizedWechatEnterSessionEvent,
  NormalizedWechatKfAccount,
  NormalizedWechatMessage,
} from "../wechat/types.js";

export interface RelayWireWechatMessage {
  message_id: string;
  open_kfid: string;
  external_userid: string;
  send_time: number;
  origin: number;
  msgtype: string;
  text?: {
    content?: string;
    menu_id?: string;
  };
  raw: Record<string, unknown>;
}

export interface RelayWireSnapshot {
  next_cursor?: string;
  subscribed_open_kfid?: string;
  kf_accounts: RelayWireKfAccount[];
  recent_messages: RelayWireWechatMessage[];
}

export interface RelayWireKfAccount {
  open_kfid: string;
  name: string;
  avatar: string;
}

export interface RelayWireWechatEnterSessionEvent {
  event_type: "enter_session";
  open_kfid: string;
  external_userid: string;
  scene?: string;
  scene_param?: string;
  welcome_code?: string;
  wechat_channels?: {
    nickname?: string;
    shop_nickname?: string;
    scene?: number;
  };
  raw: Record<string, unknown>;
}

export interface RelayAuthenticatedMessage {
  client_id: string;
  ws_path: string;
}

export interface RelayPongMessage {
  timestamp_ms: number;
}

export interface RelaySubscribedMessage {
  open_kfid: string;
}

export interface RelaySyncNowResultMessage {
  synced_count: number;
  next_cursor?: string;
}

export interface RelaySendTextPayload {
  external_userid?: string;
  touser?: string;
  open_kfid: string;
  content: string;
  msgid?: string;
}

export interface RelaySendTextResultMessage {
  errcode: number;
  errmsg: string;
  msgid?: string;
}

export interface RelayMessageOnEventPayload {
  code: string;
  content: string;
  msgid?: string;
}

export interface RelayMessageOnEventResultMessage {
  errcode: number;
  errmsg: string;
  msgid?: string;
}

export interface RelaySubscribePayload {
  open_kfid: string;
}

export interface RelayOutboundSentMessage {
  request: RelaySendTextPayload;
  result: {
    msgid?: string;
  };
}

export interface RelayCallbackMessage {
  to_user_name?: string;
  create_time?: string;
  msg_type?: string;
  event?: string;
  token?: string;
  open_kf_id?: string;
}

export interface RelayErrorMessage {
  error: string;
}

export interface RelayServerMessageMap {
  authenticated: RelayAuthenticatedMessage;
  snapshot: RelayWireSnapshot;
  subscribed: RelaySubscribedMessage;
  pong: RelayPongMessage;
  "sync_now.result": RelaySyncNowResultMessage;
  "send_text.result": RelaySendTextResultMessage;
  "message_on_event.result": RelayMessageOnEventResultMessage;
  "wechat.message": RelayWireWechatMessage;
  "wechat.enter_session": RelayWireWechatEnterSessionEvent;
  "wechat.sync.complete": RelaySyncNowResultMessage;
  "wechat.outbound.sent": RelayOutboundSentMessage;
  "wechat.callback": RelayCallbackMessage;
  "relay.error": RelayErrorMessage;
}

export type RelayServerMessage = {
  [Type in keyof RelayServerMessageMap]: {
    type: Type;
    message: RelayServerMessageMap[Type];
  };
}[keyof RelayServerMessageMap];

export type RelayServerEnvelope<Type extends keyof RelayServerMessageMap> = {
  type: Type;
  message: RelayServerMessageMap[Type];
};

export interface RelayClientCommandMap {
  ping: Record<string, never>;
  get_snapshot: Record<string, never>;
  subscribe: RelaySubscribePayload;
  sync_now: {
    token?: string;
  };
  send_text: RelaySendTextPayload;
  message_on_event: RelayMessageOnEventPayload;
}

export type RelayClientCommand = {
  [Type in keyof RelayClientCommandMap]: {
    type: Type;
    message: RelayClientCommandMap[Type];
  };
}[keyof RelayClientCommandMap];

export type RelayCommandEnvelope<Type extends keyof RelayClientCommandMap> = {
  type: Type;
  message: RelayClientCommandMap[Type];
};

const wireMessageSchema: z.ZodType<RelayWireWechatMessage> = z.object({
  message_id: z.string(),
  open_kfid: z.string(),
  external_userid: z.string(),
  send_time: z.number(),
  origin: z.number(),
  msgtype: z.string(),
  text: z
    .object({
      content: z.string().optional(),
      menu_id: z.string().optional(),
    })
    .optional(),
  raw: z.record(z.string(), z.unknown()),
});

const wireKfAccountSchema: z.ZodType<RelayWireKfAccount> = z.object({
  open_kfid: z.string(),
  name: z.string(),
  avatar: z.string(),
});

const snapshotSchema: z.ZodType<RelayWireSnapshot> = z.object({
  next_cursor: z.string().optional(),
  subscribed_open_kfid: z.string().optional(),
  kf_accounts: z.array(wireKfAccountSchema),
  recent_messages: z.array(wireMessageSchema),
});

const enterSessionEventSchema: z.ZodType<RelayWireWechatEnterSessionEvent> = z.object({
  event_type: z.literal("enter_session"),
  open_kfid: z.string(),
  external_userid: z.string(),
  scene: z.string().optional(),
  scene_param: z.string().optional(),
  welcome_code: z.string().optional(),
  wechat_channels: z
    .object({
      nickname: z.string().optional(),
      shop_nickname: z.string().optional(),
      scene: z.number().optional(),
    })
    .optional(),
  raw: z.record(z.string(), z.unknown()),
});

const authenticatedSchema: z.ZodType<RelayAuthenticatedMessage> = z.object({
  client_id: z.string(),
  ws_path: z.string(),
});

const pongSchema: z.ZodType<RelayPongMessage> = z.object({
  timestamp_ms: z.number(),
});

const subscribedSchema: z.ZodType<RelaySubscribedMessage> = z.object({
  open_kfid: z.string(),
});

const syncNowResultSchema: z.ZodType<RelaySyncNowResultMessage> = z.object({
  synced_count: z.number(),
  next_cursor: z.string().optional(),
});

const sendTextPayloadSchema: z.ZodType<RelaySendTextPayload> = z
  .object({
    external_userid: z.string().min(1).optional(),
    touser: z.string().min(1).optional(),
    open_kfid: z.string().min(1),
    content: z.string().min(1),
    msgid: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.external_userid && !value.touser) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "external_userid or touser is required",
        path: ["external_userid"],
      });
    }
  });

const sendTextResultSchema: z.ZodType<RelaySendTextResultMessage> = z.object({
  errcode: z.number(),
  errmsg: z.string(),
  msgid: z.string().optional(),
});

const messageOnEventPayloadSchema: z.ZodType<RelayMessageOnEventPayload> = z.object({
  code: z.string().min(1),
  content: z.string().min(1),
  msgid: z.string().optional(),
});

const messageOnEventResultSchema: z.ZodType<RelayMessageOnEventResultMessage> = z.object({
  errcode: z.number(),
  errmsg: z.string(),
  msgid: z.string().optional(),
});

const subscribePayloadSchema: z.ZodType<RelaySubscribePayload> = z.object({
  open_kfid: z.string().min(1),
});

const outboundSentSchema: z.ZodType<RelayOutboundSentMessage> = z.object({
  request: sendTextPayloadSchema,
  result: z.object({
    msgid: z.string().optional(),
  }),
});

const callbackSchema: z.ZodType<RelayCallbackMessage> = z.object({
  to_user_name: z.string().optional(),
  create_time: z.string().optional(),
  msg_type: z.string().optional(),
  event: z.string().optional(),
  token: z.string().optional(),
  open_kf_id: z.string().optional(),
});

const errorSchema: z.ZodType<RelayErrorMessage> = z.object({
  error: z.string(),
});

const serverMessageSchema: z.ZodType<RelayServerMessage> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("authenticated"),
    message: authenticatedSchema,
  }),
  z.object({
    type: z.literal("snapshot"),
    message: snapshotSchema,
  }),
  z.object({
    type: z.literal("subscribed"),
    message: subscribedSchema,
  }),
  z.object({
    type: z.literal("pong"),
    message: pongSchema,
  }),
  z.object({
    type: z.literal("sync_now.result"),
    message: syncNowResultSchema,
  }),
  z.object({
    type: z.literal("send_text.result"),
    message: sendTextResultSchema,
  }),
  z.object({
    type: z.literal("message_on_event.result"),
    message: messageOnEventResultSchema,
  }),
  z.object({
    type: z.literal("wechat.message"),
    message: wireMessageSchema,
  }),
  z.object({
    type: z.literal("wechat.enter_session"),
    message: enterSessionEventSchema,
  }),
  z.object({
    type: z.literal("wechat.sync.complete"),
    message: syncNowResultSchema,
  }),
  z.object({
    type: z.literal("wechat.outbound.sent"),
    message: outboundSentSchema,
  }),
  z.object({
    type: z.literal("wechat.callback"),
    message: callbackSchema,
  }),
  z.object({
    type: z.literal("relay.error"),
    message: errorSchema,
  }),
]);

const emptyCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
  z.object({
    type: z.literal("get_snapshot"),
  }),
]);

const syncNowCommandSchema = z.object({
  type: z.literal("sync_now"),
  token: z.string().optional(),
  message: z
    .object({
      token: z.string().optional(),
    })
    .optional(),
});

const subscribeCommandSchema = z.object({
  type: z.literal("subscribe"),
  open_kfid: z.string().min(1).optional(),
  message: z
    .object({
      open_kfid: z.string().min(1).optional(),
    })
    .optional(),
});

const sendTextCommandSchema = z.object({
  type: z.literal("send_text"),
  external_userid: z.string().min(1).optional(),
  touser: z.string().min(1).optional(),
  open_kfid: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  msgid: z.string().optional(),
  message: z
    .object({
      external_userid: z.string().min(1).optional(),
      touser: z.string().min(1).optional(),
      open_kfid: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      msgid: z.string().optional(),
    })
    .optional(),
});

const messageOnEventCommandSchema = z.object({
  type: z.literal("message_on_event"),
  code: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  msgid: z.string().optional(),
  message: z
    .object({
      code: z.string().min(1).optional(),
      content: z.string().min(1).optional(),
      msgid: z.string().optional(),
    })
    .optional(),
});

export function envelope<Type extends keyof RelayServerMessageMap>(
  type: Type,
  message: RelayServerMessageMap[Type],
): RelayServerEnvelope<Type> {
  return {
    type,
    message,
  };
}

export function toWireMessage(message: NormalizedWechatMessage): RelayWireWechatMessage {
  return {
    message_id: message.messageId,
    open_kfid: message.openKfId,
    external_userid: message.externalUserId,
    send_time: message.sendTime,
    origin: message.origin,
    msgtype: message.msgType,
    text: message.text
      ? {
          content: message.text.content,
          menu_id: message.text.menuId,
        }
      : undefined,
    raw: message.raw as Record<string, unknown>,
  };
}

export function toWireEnterSessionEvent(
  event: NormalizedWechatEnterSessionEvent,
): RelayWireWechatEnterSessionEvent {
  return {
    event_type: event.eventType,
    open_kfid: event.openKfId,
    external_userid: event.externalUserId,
    scene: event.scene,
    scene_param: event.sceneParam,
    welcome_code: event.welcomeCode,
    wechat_channels: event.wechatChannels
      ? {
          nickname: event.wechatChannels.nickname,
          shop_nickname: event.wechatChannels.shopNickname,
          scene: event.wechatChannels.scene,
        }
      : undefined,
    raw: event.raw as Record<string, unknown>,
  };
}

export function toWireKfAccount(account: NormalizedWechatKfAccount): RelayWireKfAccount {
  return {
    open_kfid: account.openKfId,
    name: account.name,
    avatar: account.avatar,
  };
}

export function toWireSnapshot(snapshot: {
  nextCursor?: string;
  subscribedOpenKfId?: string;
  kfAccounts: NormalizedWechatKfAccount[];
  recentMessages: NormalizedWechatMessage[];
}): RelayWireSnapshot {
  return {
    next_cursor: snapshot.nextCursor,
    subscribed_open_kfid: snapshot.subscribedOpenKfId,
    kf_accounts: snapshot.kfAccounts.map(toWireKfAccount),
    recent_messages: snapshot.recentMessages.map(toWireMessage),
  };
}

export function toWireRelayEvent(event: RelayServerEvent): RelayServerMessage {
  if (event.type === "wechat.message") {
    return envelope(event.type, toWireMessage(event.message));
  }

  if (event.type === "wechat.enter_session") {
    return envelope(event.type, toWireEnterSessionEvent(event.event));
  }

  if (event.type === "subscribed") {
    return envelope(event.type, {
      open_kfid: event.openKfId,
    });
  }

  if (event.type === "wechat.sync.complete") {
    return envelope(event.type, {
      synced_count: event.syncedCount,
      next_cursor: event.nextCursor,
    });
  }

  if (event.type === "wechat.outbound.sent") {
    return envelope(event.type, {
      request: {
        external_userid: event.request.touser,
        touser: event.request.touser,
        open_kfid: event.request.open_kfid,
        content: event.request.content,
        msgid: event.request.msgid,
      },
      result: event.result,
    });
  }

  if (event.type === "wechat.callback") {
    return envelope(event.type, {
      to_user_name: event.callback.ToUserName,
      create_time: event.callback.CreateTime,
      msg_type: event.callback.MsgType,
      event: event.callback.Event,
      token: event.callback.Token,
      open_kf_id: event.callback.OpenKfId,
    });
  }

  return envelope(event.type, {
    error: event.message,
  });
}

export function parseRelayServerMessage(raw: unknown) {
  return serverMessageSchema.parse(raw);
}

export function parseRelayCommand(raw: unknown): RelayClientCommand {
  const emptyCommand = emptyCommandSchema.safeParse(raw);
  if (emptyCommand.success) {
    return {
      type: emptyCommand.data.type,
      message: {},
    };
  }

  const syncNowCommand = syncNowCommandSchema.safeParse(raw);
  if (syncNowCommand.success) {
    return {
      type: syncNowCommand.data.type,
      message: {
        token: syncNowCommand.data.message?.token ?? syncNowCommand.data.token,
      },
    };
  }

  const subscribeCommand = subscribeCommandSchema.safeParse(raw);
  if (subscribeCommand.success) {
    return {
      type: "subscribe",
      message: subscribePayloadSchema.parse({
        open_kfid:
          subscribeCommand.data.message?.open_kfid ??
          subscribeCommand.data.open_kfid,
      }),
    };
  }

  const sendTextCommand = sendTextCommandSchema.safeParse(raw);
  if (sendTextCommand.success) {
    return {
      type: "send_text",
      message: sendTextPayloadSchema.parse({
        external_userid:
          sendTextCommand.data.message?.external_userid ??
          sendTextCommand.data.external_userid,
        touser: sendTextCommand.data.message?.touser ?? sendTextCommand.data.touser,
        open_kfid:
          sendTextCommand.data.message?.open_kfid ?? sendTextCommand.data.open_kfid,
        content: sendTextCommand.data.message?.content ?? sendTextCommand.data.content,
        msgid: sendTextCommand.data.message?.msgid ?? sendTextCommand.data.msgid,
      }),
    };
  }

  const messageOnEventCommand = messageOnEventCommandSchema.safeParse(raw);
  if (messageOnEventCommand.success) {
    return {
      type: "message_on_event",
      message: messageOnEventPayloadSchema.parse({
        code: messageOnEventCommand.data.message?.code ?? messageOnEventCommand.data.code,
        content:
          messageOnEventCommand.data.message?.content ??
          messageOnEventCommand.data.content,
        msgid:
          messageOnEventCommand.data.message?.msgid ?? messageOnEventCommand.data.msgid,
      }),
    };
  }

  throw new Error("Unsupported websocket command payload");
}

export function createCommand<Type extends keyof RelayClientCommandMap>(
  type: Type,
  message: RelayClientCommandMap[Type],
): RelayCommandEnvelope<Type> {
  return {
    type,
    message,
  };
}
