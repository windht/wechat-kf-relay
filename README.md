# 微信客服 Relay

这是一个本地运行的 Node.js 转发服务，用来把微信客服（WeChat KF）的回调、拉消息、发消息能力，桥接到一个简单的 HTTP + WebSocket 接口上，方便你本地联调、接机器人、接业务系统。

本项目现在也用在 [TIA Studio](https://github.com/ZhuxinAI/TIA-Studio) 中。

## 这个项目现在能做什么

- 校验并解密微信客服回调
- 收到回调后，调用 `kf/sync_msg` 主动拉取真实消息
- 通过 `kf/send_msg` 回发纯文本消息
- 通过 WebSocket 把收到的消息广播给下游客户端
- 支持一个可选的 `echo test` 模式，收到文本后原样回给用户
- 输出结构化日志到控制台和本地日志文件

## 相关官方文档

- 回调配置：[开发指引 / 回调配置](https://kf.weixin.qq.com/api/doc/path/93304#%E5%9B%9E%E8%B0%83%E9%85%8D%E7%BD%AE)
- 接收消息和事件：[接收消息和事件](https://kf.weixin.qq.com/api/doc/path/94745)
- 发送消息：[发送消息](https://kf.weixin.qq.com/api/doc/path/94744)

## 环境要求

- Node.js 22+
- pnpm
- 已开通并启用 API 的微信客服账号
- 以下微信客服配置项：
  - `WECHAT_CORP_ID`
  - `WECHAT_SECRET`
  - `WECHAT_TOKEN`
  - `WECHAT_ENCODING_AES_KEY`

## 快速开始

1. 复制环境变量模板

```bash
cp .env.example .env
```

2. 填写 `.env`

3. 安装依赖

```bash
pnpm install
```

4. 启动开发服务

```bash
pnpm dev
```

## 关键环境变量

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
```

### 字段说明

- `WECHAT_CORP_ID`
  微信客服企业 ID，由平台提供
- `WECHAT_SECRET`
  微信客服的 Secret，由平台提供，用来换取 `access_token`
- `WECHAT_TOKEN`
  你在微信客服后台回调配置里自定义的 Token
- `WECHAT_ENCODING_AES_KEY`
  你在微信客服后台回调配置里自定义的 43 位 EncodingAESKey
- `ECHO_TEST_ENABLED`
  是否开启“收到文本就原样回发”的测试模式
- `ECHO_TEST_PREFIX`
  Echo 模式下的前缀，例如 `[echo] `

## 日志

默认日志同时输出到：

- 控制台
- `.data/logs/relay.log`

查看日志：

```bash
tail -f .data/logs/relay.log
```

日志里会看到这些关键流转：

- 服务启动
- HTTP 请求开始/结束
- 回调解密成功
- `kf/sync_msg` 拉取批次
- 收到的微信消息
- WebSocket 客户端连接/断开/命令
- `kf/send_msg` 发消息结果

## Echo 测试模式

如果你只是想快速验证“收到消息后能不能回发成功”，可以打开：

```env
ECHO_TEST_ENABLED=true
```

可选前缀：

```env
ECHO_TEST_PREFIX=[echo] 
```

开启后：

- 用户给微信客服发文本消息
- Relay 拉到该消息
- Relay 会自动调用 `kf/send_msg` 把文本回发给该用户

建议：

- 只在联调时开启
- 验证完成后再关掉
- 它依然受微信客服原本的 48 小时窗口和发送规则约束

## HTTP 接口

### `GET /health`

健康检查。

### `GET /wechat/callback`

微信客服回调地址校验接口。

用途：

- 在微信客服后台保存回调 URL 时，微信侧会请求这个地址
- 服务会校验签名并返回解密后的 `echostr`

### `POST /wechat/callback`

微信客服回调入口。

流程：

1. 接收加密 XML
2. 校验签名
3. 解密回调体
4. 解析出回调里的 `Token`
5. 调用 `kf/sync_msg` 拉取真实消息
6. 广播到 WebSocket 客户端

### `POST /api/messages/text`

主动发送文本消息。

推荐请求体：

```json
{
  "external_userid": "wmxxxxxxxx",
  "open_kfid": "wkxxxxxxxx",
  "content": "hello from relay"
}
```

示例：

```bash
curl -X POST http://127.0.0.1:3000/api/messages/text \
  -H 'content-type: application/json' \
  -d '{
    "external_userid": "wmxxxxxxxx",
    "open_kfid": "wkxxxxxxxx",
    "content": "hello from relay"
  }'
```

### `POST /api/wechat/sync`

手动触发一次 `kf/sync_msg` 拉取。

示例：

```bash
curl -X POST http://127.0.0.1:3000/api/wechat/sync \
  -H 'content-type: application/json' \
  -d '{}'
```

### `GET /api/state`

返回当前内存快照和最近消息，主要用于调试。

说明：

- 这是一个调试接口
- 返回结构不建议作为稳定业务协议依赖

## WebSocket 协议

默认路径：

```txt
/ws
```

### 设计约定

WebSocket 的对外协议统一采用：

```json
{
  "type": "xxx",
  "message": {}
}
```

说明：

- `type` 表示消息类型
- `message` 承载具体内容
- 对外字段统一使用 `snake_case`

### 服务端推送示例

收到微信文本消息后，服务端会推：

```json
{
  "type": "wechat.message",
  "message": {
    "message_id": "from_msgid_xxx",
    "open_kfid": "wkxxxx",
    "external_userid": "wmxxxx",
    "send_time": 1710000000,
    "origin": 3,
    "msgtype": "text",
    "text": {
      "content": "你好",
      "menu_id": "menu_1"
    }
  }
}
```

连接建立后，服务端会先推：

```json
{
  "type": "connected",
  "message": {
    "client_id": "uuid",
    "ws_path": "/ws"
  }
}
```

然后推一个快照：

```json
{
  "type": "snapshot",
  "message": {
    "next_cursor": "cursor_xxx",
    "recent_messages": []
  }
}
```

### 客户端命令

#### `ping`

```json
{
  "type": "ping",
  "message": {}
}
```

#### `get_snapshot`

```json
{
  "type": "get_snapshot",
  "message": {}
}
```

#### `sync_now`

```json
{
  "type": "sync_now",
  "message": {
    "token": "optional_sync_token"
  }
}
```

#### `send_text`

推荐格式：

```json
{
  "type": "send_text",
  "message": {
    "external_userid": "wmxxxx",
    "open_kfid": "wkxxxx",
    "content": "hello from websocket",
    "msgid": "optional_msgid"
  }
}
```

兼容旧格式：

```json
{
  "type": "send_text",
  "external_userid": "wmxxxx",
  "open_kfid": "wkxxxx",
  "content": "hello from websocket"
}
```

### 服务端响应示例

`send_text` 成功后：

```json
{
  "type": "send_text.result",
  "message": {
    "errcode": 0,
    "errmsg": "ok",
    "msgid": "MSG_ID"
  }
}
```

`sync_now` 成功后：

```json
{
  "type": "sync_now.result",
  "message": {
    "synced_count": 1,
    "next_cursor": "cursor_xxx"
  }
}
```

失败时：

```json
{
  "type": "error",
  "message": {
    "error": "Unsupported websocket command payload"
  }
}
```

## Cloudflare Tunnel

如果已经安装 `cloudflared`：

```bash
./scripts/tunnel.sh 3000
```

如果还没安装（macOS）：

```bash
brew install cloudflared
```

拿到公网地址后，把它填到微信客服后台的回调 URL，例如：

```txt
https://your-public-domain.example.com/wechat/callback
```

## 推荐联调流程

1. 配好 `.env`
2. 启动 relay
3. 启动 `cloudflared`
4. 把公网 callback URL 配到微信客服后台
5. `tail -f .data/logs/relay.log`
6. 用微信给客服发一条消息
7. 观察：
   - 日志里是否出现回调解密成功
   - 是否调用了 `kf/sync_msg`
   - WebSocket 客户端是否收到 `wechat.message`
   - 如果开了 `ECHO_TEST_ENABLED=true`，是否成功回发

## 一些实现说明

- 微信客服回调本身不是完整消息体，而是一个触发器
- 真正的消息内容要再通过 `kf/sync_msg` 拉取
- 回调里带的 `Token` 建议拿来做同步拉取，它有 10 分钟有效期
- 发文本消息时，底层最终调用的是微信客服的 `kf/send_msg`
- 当前项目主要聚焦“文本收发 + websocket 转发 + 联调观察性”
