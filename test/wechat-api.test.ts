import { describe, expect, it, vi } from "vitest";

import { noopLogger } from "../src/logging/logger.js";
import {
  buildEventReplyPayload,
  buildTextReplyPayload,
  WechatKfApiClient,
} from "../src/wechat/api.js";

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

  it("paginates through the official kf/account/list API", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errcode: 0,
            errmsg: "ok",
            access_token: "access-token-1",
            expires_in: 7200,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errcode: 0,
            errmsg: "ok",
            account_list: [
              {
                open_kfid: "wk-1",
                name: "Primary",
                avatar: "https://example.com/a.png",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errcode: 0,
            errmsg: "ok",
            account_list: [
              {
                open_kfid: "wk-2",
                name: "Secondary",
                avatar: "https://example.com/b.png",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errcode: 0,
            errmsg: "ok",
            account_list: [],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );
    const apiClient = new WechatKfApiClient(
      {
        baseUrl: "https://qyapi.weixin.qq.com",
        corpId: "ww123",
        secret: "secret",
      },
      noopLogger,
      fetchImpl,
    );

    const accounts = await apiClient.listAccounts({
      limit: 1,
    });

    expect(accounts).toEqual([
      {
        open_kfid: "wk-1",
        name: "Primary",
        avatar: "https://example.com/a.png",
      },
      {
        open_kfid: "wk-2",
        name: "Secondary",
        avatar: "https://example.com/b.png",
      },
    ]);

    const firstRequestUrl = new URL(fetchImpl.mock.calls[1]?.[0].toString() ?? "");
    const secondRequestUrl = new URL(fetchImpl.mock.calls[2]?.[0].toString() ?? "");
    const thirdRequestUrl = new URL(fetchImpl.mock.calls[3]?.[0].toString() ?? "");

    expect(firstRequestUrl.pathname).toBe("/cgi-bin/kf/account/list");
    expect(firstRequestUrl.searchParams.get("access_token")).toBe("access-token-1");
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      offset: 0,
      limit: 1,
    });
    expect(secondRequestUrl.pathname).toBe("/cgi-bin/kf/account/list");
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toEqual({
      offset: 1,
      limit: 1,
    });
    expect(thirdRequestUrl.pathname).toBe("/cgi-bin/kf/account/list");
    expect(JSON.parse(String(fetchImpl.mock.calls[3]?.[1]?.body))).toEqual({
      offset: 2,
      limit: 1,
    });
  });
});
