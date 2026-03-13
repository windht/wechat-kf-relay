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

export interface WechatEnterSessionWechatChannels {
  nickname?: string;
  shop_nickname?: string;
  scene?: number;
}

export interface WechatEnterSessionSyncEvent {
  event_type: "enter_session";
  open_kfid: string;
  external_userid: string;
  scene?: string;
  scene_param?: string;
  welcome_code?: string;
  wechat_channels?: WechatEnterSessionWechatChannels;
  [key: string]: unknown;
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
  event?: WechatEnterSessionSyncEvent | Record<string, unknown>;
  [key: string]: unknown;
}

export interface WechatSyncResponse {
  errcode: number;
  errmsg: string;
  next_cursor?: string;
  has_more?: number;
  msg_list?: WechatSyncMessage[];
}

export interface WechatKfAccount {
  open_kfid: string;
  name: string;
  avatar: string;
}

export interface WechatKfAccountListResponse {
  errcode: number;
  errmsg: string;
  account_list?: WechatKfAccount[];
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

export interface SendMessageOnEventInput {
  code: string;
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

export interface NormalizedWechatEnterSessionEvent {
  eventType: "enter_session";
  openKfId: string;
  externalUserId: string;
  scene?: string;
  sceneParam?: string;
  welcomeCode?: string;
  wechatChannels?: {
    nickname?: string;
    shopNickname?: string;
    scene?: number;
  };
  raw: WechatSyncMessage;
}

export interface NormalizedWechatKfAccount {
  openKfId: string;
  name: string;
  avatar: string;
}
