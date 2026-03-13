import { describe, expect, it } from "vitest";

import { buildTextReplyPayload } from "../src/wechat/api.js";

describe("buildTextReplyPayload", () => {
  it("maps relay fields into WeChat send_msg payload", () => {
    expect(
      buildTextReplyPayload({
        touser: "user-1",
        openKfId: "kf-1",
        content: "hello",
      }),
    ).toEqual({
      touser: "user-1",
      open_kfid: "kf-1",
      msgid: undefined,
      msgtype: "text",
      text: {
        content: "hello",
      },
    });
  });
});
