import { parseStringPromise } from "xml2js";

import type { WechatCallbackEnvelope, WechatCallbackEvent } from "./types.js";

async function parseXml<T>(xml: string) {
  return parseStringPromise(xml, {
    explicitArray: false,
    trim: true,
  }) as Promise<T>;
}

export async function extractEncryptedPayload(xml: string) {
  const parsed = await parseXml<WechatCallbackEnvelope>(xml);
  const encrypted = parsed.xml?.Encrypt;

  if (!encrypted) {
    throw new Error("Missing Encrypt field in callback envelope");
  }

  return encrypted;
}

export async function parseCallbackEvent(xml: string) {
  const parsed = await parseXml<{ xml: WechatCallbackEvent }>(xml);

  if (!parsed.xml) {
    throw new Error("Missing xml root element in callback payload");
  }

  return parsed.xml;
}
