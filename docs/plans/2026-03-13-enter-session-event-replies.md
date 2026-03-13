# Enter Session Event Replies Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose WeChat `enter_session` events as a dedicated websocket message and allow websocket clients to answer them through the WeChat event-response API.

**Architecture:** Keep ordinary customer messages on the existing `wechat.message` path, but recognize `msgtype=event` + `event_type=enter_session` during sync normalization and broadcast them as a distinct `wechat.enter_session` server event. Add a matching websocket client command for replying with `message_on_event`, and route that through a new WeChat API client method that calls the event response endpoint with the event `welcome_code`.

**Tech Stack:** Node.js 22, TypeScript, Express, ws, Zod, Vitest

---

### Task 1: Define enter_session wire types and command parsing

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/wechat/types.ts`
- Modify: `src/index.ts`
- Test: `test/websocket-wire.test.ts`

**Step 1: Write the failing test**

```ts
it("formats enter_session events and parses message_on_event commands", () => {
  expect(toWireRelayEvent({ type: "wechat.enter_session", event: normalized })).toEqual(...);
  expect(parseRelayCommand({ type: "message_on_event", message: payload })).toEqual(...);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/websocket-wire.test.ts`
Expected: FAIL because the new event and command do not exist yet

**Step 3: Write minimal implementation**

```ts
export interface RelayWireWechatEnterSessionEvent { ... }
export interface RelayMessageOnEventPayload { ... }
```

```ts
if (event.type === "wechat.enter_session") {
  return envelope(event.type, toWireEnterSessionEvent(event.event));
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/websocket-wire.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/protocol.ts src/wechat/types.ts src/index.ts test/websocket-wire.test.ts
git commit -m "feat: add enter_session websocket protocol"
```

### Task 2: Add relay and API support for replying to enter_session events

**Files:**
- Modify: `src/wechat/api.ts`
- Modify: `src/relay/relay-service.ts`
- Modify: `src/websocket/ws-server.ts`
- Test: `test/wechat-api.test.ts`
- Test: `test/relay-service.test.ts`

**Step 1: Write the failing test**

```ts
it("routes message_on_event replies through the event response API", async () => {
  await relayService.sendEventMessage({ code: "welcome-code", ... });
  expect(apiClient.sendEventMessage).toHaveBeenCalledWith(...);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/relay-service.test.ts test/wechat-api.test.ts`
Expected: FAIL because the relay and API client cannot send event replies yet

**Step 3: Write minimal implementation**

```ts
buildEventReplyPayload(input) {
  return { code: input.code, msgtype: "text", text: { content: input.content } };
}
```

```ts
async sendEventMessage(input) {
  return this.apiClient.sendEventMessage(input);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/relay-service.test.ts test/wechat-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wechat/api.ts src/relay/relay-service.ts src/websocket/ws-server.ts test/wechat-api.test.ts test/relay-service.test.ts
git commit -m "feat: support replying to enter_session events"
```

### Task 3: Verify end-to-end client behavior and refresh docs

**Files:**
- Modify: `src/client/relay-client.ts`
- Modify: `README.md`
- Test: `test/client-package.test.ts`
- Test: `test/server-package.test.ts`

**Step 1: Write the failing test**

```ts
it("emits wechat.enter_session and sends message_on_event replies", async () => {
  client.messageOnEvent({ code: "welcome-code", open_kfid: "wk-1", content: "hi" });
  expect(await once(client, "wechat.enter_session")).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/client-package.test.ts test/server-package.test.ts`
Expected: FAIL because the client API and docs are out of date

**Step 3: Write minimal implementation**

```ts
messageOnEvent(payload: RelayMessageOnEventPayload) {
  this.sendCommand(createCommand("message_on_event", payload));
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/client-package.test.ts test/server-package.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/client/relay-client.ts README.md test/client-package.test.ts test/server-package.test.ts
git commit -m "docs: document enter_session event replies"
```
