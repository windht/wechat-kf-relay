# KF Subscription Routing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fetch all WeChat KF accounts from the official `kf/account/list` API, expose them to clients, and require each websocket client to subscribe to a single `kf_id` before receiving or sending scoped traffic.

**Architecture:** Extend the WeChat API client with paginated account listing and let the relay service cache the normalized KF account set alongside recent messages and welcome-code ownership. The websocket server will track one active `kf_id` subscription per socket, filter inbound/outbound events by that subscription, and reject text/event replies that do not match the subscribed account.

**Tech Stack:** Node.js 22, TypeScript, Express, ws, Zod, Vitest

---

### Task 1: Cover the new behavior with tests

**Files:**
- Modify: `test/wechat-api.test.ts`
- Modify: `test/websocket-wire.test.ts`
- Modify: `test/relay-service.test.ts`
- Modify: `test/http-app.test.ts`
- Modify: `test/client-package.test.ts`
- Modify: `test/server-package.test.ts`

**Step 1: Write the failing tests**

```ts
it("builds paginated KF account list requests and snapshots include accounts", () => {
  expect(accounts).toEqual([{ open_kfid: "wk-1" }]);
});
```

```ts
it("requires websocket subscription before scoped messages are delivered or sent", async () => {
  client.subscribeTo("wk-1");
  expect(await once(client, "subscribed")).toMatchObject({ open_kfid: "wk-1" });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/wechat-api.test.ts test/websocket-wire.test.ts test/relay-service.test.ts test/http-app.test.ts test/client-package.test.ts test/server-package.test.ts`
Expected: FAIL because the protocol, relay state, and websocket gating do not exist yet.

**Step 3: Implement the minimal assertions**

```ts
expect(parseRelayCommand({
  type: "subscribe",
  message: { open_kfid: "wk-1" },
})).toEqual(createCommand("subscribe", { open_kfid: "wk-1" }));
```

**Step 4: Run tests to verify the expectations are correct**

Run: `pnpm vitest run test/wechat-api.test.ts test/websocket-wire.test.ts test/relay-service.test.ts test/http-app.test.ts test/client-package.test.ts test/server-package.test.ts`
Expected: FAIL only on missing implementation details.

**Step 5: Commit**

```bash
git add test/wechat-api.test.ts test/websocket-wire.test.ts test/relay-service.test.ts test/http-app.test.ts test/client-package.test.ts test/server-package.test.ts
git commit -m "test: cover kf subscription routing"
```

### Task 2: Add KF account discovery and scoped relay state

**Files:**
- Modify: `src/wechat/types.ts`
- Modify: `src/wechat/api.ts`
- Modify: `src/relay/relay-service.ts`
- Modify: `src/server/relay.ts`

**Step 1: Write the failing test**

```ts
it("fetches all account list pages before exposing relay snapshots", async () => {
  expect(snapshot.kfAccounts).toHaveLength(2);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/wechat-api.test.ts test/relay-service.test.ts`
Expected: FAIL because account listing is not implemented.

**Step 3: Write minimal implementation**

```ts
async listAccounts() {
  const accounts = [];
  let offset = 0;
  while (true) {
    const page = await this.postJson(url, { offset, limit: 100 });
    accounts.push(...page.account_list);
    if ((page.account_list?.length ?? 0) < 100) break;
    offset += page.account_list.length;
  }
  return accounts;
}
```

**Step 4: Run tests to verify it passes**

Run: `pnpm vitest run test/wechat-api.test.ts test/relay-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wechat/types.ts src/wechat/api.ts src/relay/relay-service.ts src/server/relay.ts
git commit -m "feat: load wechat kf accounts"
```

### Task 3: Enforce websocket subscriptions and scoped outbound actions

**Files:**
- Modify: `src/shared/protocol.ts`
- Modify: `src/websocket/ws-server.ts`
- Modify: `src/client/relay-client.ts`

**Step 1: Write the failing test**

```ts
it("rejects send_text and message_on_event outside the subscribed kf_id", async () => {
  expect(error.message.error).toContain("subscribe");
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/websocket-wire.test.ts test/client-package.test.ts test/server-package.test.ts`
Expected: FAIL because sockets are not subscription-aware.

**Step 3: Write minimal implementation**

```ts
if (command.type === "subscribe") {
  state.subscribedOpenKfId = command.message.open_kfid;
  send(socket, envelope("subscribed", { open_kfid: command.message.open_kfid }));
}
```

```ts
if (command.type === "send_text" && command.message.open_kfid !== state.subscribedOpenKfId) {
  throw new Error("send_text is limited to the subscribed open_kfid");
}
```

**Step 4: Run tests to verify it passes**

Run: `pnpm vitest run test/websocket-wire.test.ts test/client-package.test.ts test/server-package.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/shared/protocol.ts src/websocket/ws-server.ts src/client/relay-client.ts
git commit -m "feat: scope websocket traffic by kf subscription"
```

### Task 4: Update docs, bump version, and prepare release

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `CHANGELOG.md`

**Step 1: Write the failing check**

```bash
pnpm pack --dry-run
```

Expected: Package metadata still reflects the old release and docs do not mention subscriptions.

**Step 2: Write the minimal updates**

```json
{
  "version": "0.3.0"
}
```

```md
- websocket clients must call `subscribeTo(openKfId)` before receiving account-scoped traffic
```

**Step 3: Run verification**

Run: `pnpm test && pnpm build && pnpm pack --dry-run`
Expected: PASS

**Step 4: Publish release refs**

```bash
git add README.md CHANGELOG.md package.json
git commit -m "chore: release 0.3.0"
git tag v0.3.0
git push origin main
git push origin v0.3.0
```
