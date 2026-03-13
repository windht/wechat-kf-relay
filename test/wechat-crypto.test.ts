import { describe, expect, it } from "vitest";

import {
  decryptCallbackMessage,
  encryptReplyMessage,
  sha1Signature,
  verifyCallbackUrl,
} from "../src/wechat/crypto.js";

const cryptoConfig = {
  token: "Token123",
  encodingAesKey: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  receiveId: "ww1234567890",
};

describe("wechat crypto", () => {
  it("sorts parts before hashing", () => {
    expect(sha1Signature("b", "a", "c")).toBe(sha1Signature("c", "b", "a"));
  });

  it("round-trips callback URL verification", () => {
    const timestamp = "1711111111";
    const nonce = "nonce-1";
    const replyXml = "<xml><Test>hello</Test></xml>";
    const envelope = encryptReplyMessage({
      config: cryptoConfig,
      replyXml,
      timestamp,
      nonce,
    });
    const echoStr = envelope.match(/<Encrypt><!\[CDATA\[(.+?)\]\]><\/Encrypt>/)?.[1];

    expect(echoStr).toBeTruthy();

    const verified = verifyCallbackUrl({
      config: cryptoConfig,
      msgSignature: sha1Signature(cryptoConfig.token, timestamp, nonce, echoStr ?? ""),
      timestamp,
      nonce,
      echoStr: echoStr ?? "",
    });

    expect(verified).toBe(replyXml);
  });

  it("decrypts an encrypted callback envelope", async () => {
    const timestamp = "1711111111";
    const nonce = "nonce-2";
    const plainXml = "<xml><Token><![CDATA[sync-token]]></Token></xml>";
    const encryptedEnvelope = encryptReplyMessage({
      config: cryptoConfig,
      replyXml: plainXml,
      timestamp,
      nonce,
    });
    const signature = encryptedEnvelope.match(
      /<MsgSignature><!\[CDATA\[(.+?)\]\]><\/MsgSignature>/,
    )?.[1];

    expect(signature).toBeTruthy();

    const decrypted = await decryptCallbackMessage({
      config: cryptoConfig,
      msgSignature: signature ?? "",
      timestamp,
      nonce,
      postData: encryptedEnvelope,
    });

    expect(decrypted).toBe(plainXml);
  });
});
