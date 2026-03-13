import { z } from "zod";

import type { RelayServerEvent } from "../relay/relay-service.js";
import type { NormalizedWechatMessage } from "../wechat/types.js";

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
  recent_messages: RelayWireWechatMessage[];
}

export interface RelayAuthenticatedMessage {
  client_id: string;
  ws_path: string;
}

export interface RelayPongMessage {
  timestamp_ms: number;
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
  pong: RelayPongMessage;
  "sync_now.result": RelaySyncNowResultMessage;
  "send_text.result": RelaySendTextResultMessage;
  "wechat.message": RelayWireWechatMessage;
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
  sync_now: {
    token?: string;
  };
  send_text: RelaySendTextPayload;
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

const snapshotSchema: z.ZodType<RelayWireSnapshot> = z.object({
  next_cursor: z.string().optional(),
  recent_messages: z.array(wireMessageSchema),
});

const authenticatedSchema: z.ZodType<RelayAuthenticatedMessage> = z.object({
  client_id: z.string(),
  ws_path: z.string(),
});

const pongSchema: z.ZodType<RelayPongMessage> = z.object({
  timestamp_ms: z.number(),
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
    type: z.literal("wechat.message"),
    message: wireMessageSchema,
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

export function toWireSnapshot(snapshot: {
  nextCursor?: string;
  recentMessages: NormalizedWechatMessage[];
}): RelayWireSnapshot {
  return {
    next_cursor: snapshot.nextCursor,
    recent_messages: snapshot.recentMessages.map(toWireMessage),
  };
}

export function toWireRelayEvent(event: RelayServerEvent): RelayServerMessage {
  if (event.type === "wechat.message") {
    return envelope(event.type, toWireMessage(event.message));
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
