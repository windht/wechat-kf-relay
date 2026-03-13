# wechat-kf-relay

`wechat-kf-relay` 是一个把微信客服回调、拉消息、发消息能力桥接到本地 HTTP + WebSocket 的 Node.js/TypeScript 包。

它现在同时支持两种使用方式：

- 作为独立服务直接启动
- 作为可复用 npm package 嵌入现有 Express 服务

项目当前也用于 [TIA Studio](https://github.com/ZhuxinAI/TIA-Studio)。

## 功能概览

- 校验并解密微信客服回调
- 收到回调后调用 `kf/sync_msg` 拉取真实消息
- 启动时调用 `kf/account/list` 拉取全部客服账号
- 通过 `kf/send_msg` 发送文本消息
- 通过 WebSocket 向下游广播微信消息和状态事件
- WebSocket 客户端必须先订阅指定 `kf_id`，之后只会收到该账号的消息，并且只能以该账号发消息
- 提供类型安全的 Node.js 客户端 `wechat-kf-relay/client`
- 支持可选 `echo test` 模式
- 支持 `server_key` 作为本地管理接口和 WebSocket 的访问门禁

## 安装

```bash
pnpm add wechat-kf-relay
```

或：

```bash
npm install wechat-kf-relay
```

也可以在本仓库本地开发：

```bash
pnpm install
pnpm dev
```

## Server Package

### 独立启动

```ts
import WechatKfRelay from "wechat-kf-relay/server";

const relay = new WechatKfRelay({
  corpId: process.env.WECHAT_CORP_ID,
  secret: process.env.WECHAT_SECRET,
  token: process.env.WECHAT_TOKEN,
  encodingAesKey: process.env.WECHAT_ENCODING_AES_KEY,
  serverKey: process.env.SERVER_KEY,
});

const serverInfo = await relay.start();

console.log(serverInfo.httpBaseUrl);
console.log(serverInfo.wsUrl);
```

如果不显式传入这四个微信配置项，`WechatKfRelay` 会自动从环境变量读取。

### 嵌入现有 Express

`handler()` 可以把 HTTP 路由挂到现有 Express 应用里：

```ts
import http from "node:http";
import express from "express";
import WechatKfRelay from "wechat-kf-relay/server";

const relay = new WechatKfRelay({
  corpId: process.env.WECHAT_CORP_ID,
  secret: process.env.WECHAT_SECRET,
  token: process.env.WECHAT_TOKEN,
  encodingAesKey: process.env.WECHAT_ENCODING_AES_KEY,
  serverKey: process.env.SERVER_KEY,
  wsPath: "/relay/ws",
});

const app = express();
app.use("/relay", relay.handler());

const server = http.createServer(app);
relay.attach(server);

server.listen(3000);
```

说明：

- `app.use("/relay", relay.handler())` 会把回调和 `/api/*` 路由挂到 `/relay` 前缀下
- WebSocket 升级发生在 `http.Server` 层，所以如果你要在嵌入模式里继续使用 WebSocket，除了 `handler()` 之外还要调用 `relay.attach(server)`
- 如果只需要 HTTP 接口，单独挂 `handler()` 也可以

## Client Package

```ts
import WechatKfRelayClient from "wechat-kf-relay/client";

const client = new WechatKfRelayClient({
  url: "ws://127.0.0.1:3000/ws",
  key: process.env.SERVER_KEY,
});

client.on("authenticated", (payload) => {
  console.log("authenticated", payload.client_id);
});

client.on("snapshot", (snapshot) => {
  const primaryKf = snapshot.kf_accounts[0];
  if (!primaryKf) {
    return;
  }

  client.subscribeTo(primaryKf.open_kfid);
});

client.on("subscribed", (payload) => {
  console.log("subscribed", payload.open_kfid);
});

client.on("wechat.message", (message) => {
  console.log(message.open_kfid, message.text?.content);
});

client.on("wechat.enter_session", (event) => {
  if (!event.welcome_code) {
    return;
  }

  client.messageOnEvent({
    code: event.welcome_code,
    content: "欢迎咨询",
  });
});

client.on("wechat.outbound.sent", (event) => {
  console.log(event.result.msgid);
});

client.connect();
client.syncNow();
```

客户端会把 `key` 自动带到 WebSocket 握手里，并按类型发出这些常用事件：

- `authenticated`
- `snapshot`
- `subscribed`
- `wechat.message`
- `wechat.enter_session`
- `wechat.sync.complete`
- `wechat.outbound.sent`
- `send_text.result`
- `message_on_event.result`
- `relay.error`
- `socket.error`

客户端实例提供这些方法：

- `client.on(event, listener)`
- `client.once(event, listener)`
- `client.off(event, listener)`
- `client.connect()`
- `client.disconnect(code?, reason?)`
- `client.ping()`
- `client.getSnapshot()`
- `client.syncNow(token?)`
- `client.subscribeTo(openKfId)`
- `client.sendText({ external_userid, open_kfid, content, msgid? })`
- `client.messageOnEvent({ code, content, msgid? })`

说明：

- `snapshot.kf_accounts` 会返回当前企业下全部可订阅的客服账号
- `snapshot.subscribed_open_kfid` 表示这个 WebSocket 当前订阅的账号；刚连上时为空
- 在调用 `subscribeTo(openKfId)` 之前，客户端不会收到任何账号级消息或事件
- `sendText` 里的 `open_kfid` 必须与当前订阅一致，否则服务端会拒绝
- `messageOnEvent` 只能回复当前订阅账号收到的 `welcome_code`

## 环境变量

```env
PORT=3000
HOST=0.0.0.0

LOG_LEVEL=info
LOG_FILE=.data/logs/relay.log

ECHO_TEST_ENABLED=false
ECHO_TEST_PREFIX=

WS_PATH=/ws
WECHAT_CALLBACK_PATH=/wechat/callback
STATE_FILE=.data/wechat-kf-relay-state.json

WECHAT_API_BASE_URL=https://qyapi.weixin.qq.com
WECHAT_CORP_ID=wwxxxxxxxxxxxxxxxx
WECHAT_SECRET=your_wechat_kf_secret
WECHAT_TOKEN=YourCallbackToken123
WECHAT_ENCODING_AES_KEY=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG

SERVER_KEY=replace-me
```

可从模板开始：

```bash
cp .env.example .env
```

## `server_key` 门禁

设置 `SERVER_KEY` 后：

- `GET /health` 不受影响
- 微信回调地址不受影响，因为微信侧不会携带你的本地密钥
- 所有 `/api/*` 路由需要带上 `x-wechat-relay-key` 头，或 `server_key` 查询参数/请求体字段
- WebSocket 握手需要带上同一个 key
- `WechatKfRelayClient` 的 `key` 参数会自动处理这件事

## 默认路由

独立启动时默认暴露这些路径：

- `GET /health`
- `GET /wechat/callback`
- `POST /wechat/callback`
- `POST /api/messages/text`
- `POST /api/wechat/sync`
- `GET /api/state`
- `WS /ws`

## Caddy HTTPS 示例

仓库根目录提供了一个可直接改的示例文件：[Caddyfile.example](./Caddyfile.example)。

它会把 HTTPS 请求反向代理到本地 relay 默认端口 `3000`，并且 WebSocket `/ws` 也会一起透传，不需要额外配置。

本地开发可以这样跑：

```bash
pnpm dev
caddy trust
caddy run --config ./Caddyfile.example
```

然后访问：

- `https://relay.localhost/health`
- `wss://relay.localhost/ws`

如果你要给企业微信回调配置一个公网 HTTPS 地址，请把示例里的 `relay.example.com` 替换成真实域名，并使用那个公网域名的站点块。那种情况下不要用 `tls internal`，让 Caddy 自动申请公开可验证的证书即可。

## HTTP 示例

发送文本消息：

```bash
curl -X POST http://127.0.0.1:3000/api/messages/text \
  -H 'content-type: application/json' \
  -H 'x-wechat-relay-key: replace-me' \
  -d '{
    "external_userid": "wmxxxxxxxx",
    "open_kfid": "wkxxxxxxxx",
    "content": "hello from relay"
  }'
```

手动触发一次同步：

```bash
curl -X POST http://127.0.0.1:3000/api/wechat/sync \
  -H 'content-type: application/json' \
  -H 'x-wechat-relay-key: replace-me' \
  -d '{}'
```

## WebSocket 协议

服务端推送统一是：

```json
{
  "type": "wechat.message",
  "message": {}
}
```

对外字段统一使用 `snake_case`。

常见服务端事件：

- `authenticated`
- `snapshot`
- `subscribed`
- `pong`
- `wechat.message`
- `wechat.enter_session`
- `wechat.sync.complete`
- `wechat.outbound.sent`
- `wechat.callback`
- `relay.error`

常见客户端命令：

- `ping`
- `get_snapshot`
- `subscribe`
- `sync_now`
- `send_text`
- `message_on_event`

## Echo 测试模式

如果只想快速验证“收到消息后能否自动回发”，可以开启：

```env
ECHO_TEST_ENABLED=true
ECHO_TEST_PREFIX=[echo] 
```

开启后收到文本消息时，relay 会自动调用 `kf/send_msg` 原样回发。

## 本地验证命令

```bash
pnpm test
pnpm build
pnpm pack --dry-run
```

## 相关官方文档

- 回调配置：[开发指引 / 回调配置](https://kf.weixin.qq.com/api/doc/path/93304#%E5%9B%9E%E8%B0%83%E9%85%8D%E7%BD%AE)
- 接收消息和事件：[接收消息和事件](https://kf.weixin.qq.com/api/doc/path/94745)
- 发送消息：[发送消息](https://kf.weixin.qq.com/api/doc/path/94744)
- 获取客服账号列表：[获取客服账号列表](https://kf.weixin.qq.com/api/doc/path/94746)
