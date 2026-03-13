import { describe, expect, it } from "vitest";

import { buildEventReplyPayload, buildTextReplyPayload } from "../src/wechat/api.js";

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

  it("maps event replies into WeChat send_msg_on_event payload", () => {
    expect(
      buildEventReplyPayload({
        code: "welcome-1",
        content: "欢迎咨询",
        msgid: "custom-1",
      }),
    ).toEqual({
      code: "welcome-1",
      msgid: "custom-1",
      msgtype: "text",
      text: {
        content: "欢迎咨询",
      },
    });
  });
});
