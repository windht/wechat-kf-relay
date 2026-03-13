import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { extractEncryptedPayload } from "./xml.js";

const BLOCK_SIZE = 32;

export interface WechatCryptoConfig {
  token: string;
  encodingAesKey: string;
  receiveId: string;
}

function decodeAesKey(encodingAesKey: string) {
  const key = Buffer.from(`${encodingAesKey}=`, "base64");

  if (key.length !== 32) {
    throw new Error("Decoded EncodingAESKey must be 32 bytes");
  }

  return key;
}

function pkcs7Pad(buffer: Buffer) {
  const padSize = BLOCK_SIZE - (buffer.length % BLOCK_SIZE || BLOCK_SIZE);
  return Buffer.concat([buffer, Buffer.alloc(padSize, padSize)]);
}

function pkcs7Unpad(buffer: Buffer) {
  const amountToRemove = buffer[buffer.length - 1];

  if (!amountToRemove || amountToRemove > BLOCK_SIZE) {
    throw new Error("Invalid PKCS7 padding");
  }

  return buffer.subarray(0, buffer.length - amountToRemove);
}

function buildPlaintextBuffer(message: string, receiveId: string) {
  const randomPrefix = randomBytes(16);
  const messageBuffer = Buffer.from(message, "utf8");
  const receiveIdBuffer = Buffer.from(receiveId, "utf8");
  const lengthBuffer = Buffer.alloc(4);

  lengthBuffer.writeUInt32BE(messageBuffer.length, 0);

  return pkcs7Pad(
    Buffer.concat([randomPrefix, lengthBuffer, messageBuffer, receiveIdBuffer]),
  );
}

function decryptCiphertext(ciphertext: string, config: WechatCryptoConfig) {
  const key = decodeAesKey(config.encodingAesKey);
  const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16));
  const encryptedBuffer = Buffer.from(ciphertext, "base64");

  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ]);
  const unpadded = pkcs7Unpad(decrypted);
  const messageLength = unpadded.readUInt32BE(16);
  const messageStart = 20;
  const messageEnd = messageStart + messageLength;
  const message = unpadded.subarray(messageStart, messageEnd).toString("utf8");
  const receiveId = unpadded.subarray(messageEnd).toString("utf8");

  if (receiveId !== config.receiveId) {
    throw new Error("receiveId mismatch while decrypting WeChat payload");
  }

  return message;
}

function encryptCiphertext(message: string, config: WechatCryptoConfig) {
  const key = decodeAesKey(config.encodingAesKey);
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16));

  cipher.setAutoPadding(false);

  return Buffer.concat([
    cipher.update(buildPlaintextBuffer(message, config.receiveId)),
    cipher.final(),
  ]).toString("base64");
}

export function sha1Signature(...parts: string[]) {
  return createHash("sha1")
    .update([...parts].sort().join(""), "utf8")
    .digest("hex");
}

export function verifyCallbackUrl(input: {
  config: WechatCryptoConfig;
  msgSignature: string;
  timestamp: string;
  nonce: string;
  echoStr: string;
}) {
  const expectedSignature = sha1Signature(
    input.config.token,
    input.timestamp,
    input.nonce,
    input.echoStr,
  );

  if (expectedSignature !== input.msgSignature) {
    throw new Error("Invalid WeChat callback verification signature");
  }

  return decryptCiphertext(input.echoStr, input.config);
}

export async function decryptCallbackMessage(input: {
  config: WechatCryptoConfig;
  msgSignature: string;
  timestamp: string;
  nonce: string;
  postData: string;
}) {
  const encrypted = await extractEncryptedPayload(input.postData);
  const expectedSignature = sha1Signature(
    input.config.token,
    input.timestamp,
    input.nonce,
    encrypted,
  );

  if (expectedSignature !== input.msgSignature) {
    throw new Error("Invalid WeChat callback message signature");
  }

  return decryptCiphertext(encrypted, input.config);
}

export function encryptReplyMessage(input: {
  config: WechatCryptoConfig;
  replyXml: string;
  timestamp: string;
  nonce: string;
}) {
  const encrypted = encryptCiphertext(input.replyXml, input.config);
  const signature = sha1Signature(
    input.config.token,
    input.timestamp,
    input.nonce,
    encrypted,
  );

  return [
    "<xml>",
    `<Encrypt><![CDATA[${encrypted}]]></Encrypt>`,
    `<MsgSignature><![CDATA[${signature}]]></MsgSignature>`,
    `<TimeStamp>${input.timestamp}</TimeStamp>`,
    `<Nonce><![CDATA[${input.nonce}]]></Nonce>`,
    "</xml>",
  ].join("");
}
