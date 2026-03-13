export interface WechatCallbackEnvelope {
  xml: {
    Encrypt: string;
  };
}

export interface WechatCallbackEvent {
  ToUserName?: string;
  CreateTime?: string;
  MsgType?: string;
  Event?: string;
  Token?: string;
  OpenKfId?: string;
}

export interface WechatSyncMessage {
  msgid: string;
  open_kfid: string;
  external_userid: string;
  send_time: number;
  origin: number;
  msgtype: string;
  text?: {
    content?: string;
    menu_id?: string;
  };
  event?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WechatSyncResponse {
  errcode: number;
  errmsg: string;
  next_cursor?: string;
  has_more?: number;
  msg_list?: WechatSyncMessage[];
}

export interface WechatSendResponse {
  errcode: number;
  errmsg: string;
  msgid?: string;
}

export interface SendTextInput {
  touser: string;
  openKfId: string;
  content: string;
  msgid?: string;
}

export interface NormalizedWechatMessage {
  messageId: string;
  openKfId: string;
  externalUserId: string;
  sendTime: number;
  origin: number;
  msgType: string;
  text?: {
    content?: string;
    menuId?: string;
  };
  raw: WechatSyncMessage;
}
