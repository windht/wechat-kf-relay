# WeChat KF Relay Package Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the existing relay app into a publishable npm package with reusable typed `server` and `client` entrypoints, websocket auth gating, release automation, and updated documentation.

**Architecture:** Extract the current standalone startup flow into composable server-side primitives: a typed relay class that can either start its own HTTP/WebSocket server or mount as Express middleware, plus a standalone binary entrypoint that reuses the same class. Add a typed websocket client package that speaks the relay wire protocol, authenticates with a shared server key, and exposes event-driven APIs, then publish both entrypoints through package export maps and GitHub Actions release workflows.

**Tech Stack:** Node.js 22, TypeScript, Express, ws, Zod, Vitest, GitHub Actions, npm

---

### Task 1: Define package entrypoints and shared public types

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `src/index.ts`
- Create: `src/server/index.ts`
- Create: `src/client/index.ts`
- Create: `src/shared/protocol.ts`
- Test: `test/package-exports.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

describe("package exports", () => {
  it("resolves the server and client entrypoints", async () => {
    const serverModule = await import("../src/server/index.js");
    const clientModule = await import("../src/client/index.js");

    expect(serverModule.default).toBeTypeOf("function");
    expect(clientModule.default).toBeTypeOf("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/package-exports.test.ts`
Expected: FAIL with missing modules or missing default exports

**Step 3: Write minimal implementation**

```ts
export class WechatKfRelayServer {}
export default WechatKfRelayServer;
```

```ts
export class WechatKfRelayClient {}
export default WechatKfRelayClient;
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/package-exports.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json tsconfig.json src/index.ts src/server/index.ts src/client/index.ts src/shared/protocol.ts test/package-exports.test.ts
git commit -m "feat: define package entrypoints"
```

### Task 2: Refactor server runtime into a reusable class and standalone launcher

**Files:**
- Modify: `src/config.ts`
- Modify: `src/http/app.ts`
- Modify: `src/relay/relay-service.ts`
- Modify: `src/websocket/ws-server.ts`
- Create: `src/server/relay-server.ts`
- Create: `src/server/standalone.ts`
- Test: `test/http-app.test.ts`
- Test: `test/server-package.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import WechatKfRelayServer from "../src/server/index.js";

describe("WechatKfRelayServer", () => {
  it("returns an express handler for mounting", () => {
    const relay = new WechatKfRelayServer({ /* test config */ });
    expect(relay.handler()).toBeTypeOf("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/server-package.test.ts`
Expected: FAIL because the server class is not implemented

**Step 3: Write minimal implementation**

```ts
handler() {
  return createApp(/* shared deps */);
}
```

```ts
async start() {
  this.server = createServer(this.handler());
  this.websocket = createRelayWebSocketServer(/* ... */);
  await new Promise((resolve) => this.server.listen(this.port, this.host, resolve));
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/server-package.test.ts test/http-app.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/http/app.ts src/relay/relay-service.ts src/websocket/ws-server.ts src/server/relay-server.ts src/server/standalone.ts test/http-app.test.ts test/server-package.test.ts
git commit -m "feat: add reusable relay server class"
```

### Task 3: Add server-key authentication to HTTP and WebSocket flows

**Files:**
- Modify: `src/config.ts`
- Modify: `src/http/app.ts`
- Modify: `src/websocket/ws-server.ts`
- Modify: `src/shared/protocol.ts`
- Test: `test/http-app.test.ts`
- Test: `test/websocket-wire.test.ts`
- Test: `test/server-package.test.ts`

**Step 1: Write the failing test**

```ts
it("rejects websocket and API access without the configured server key", async () => {
  expect(await connectWithoutKey()).toEqual({ type: "error" });
  expect((await request(app).post("/api/wechat/sync").send({})).status).toBe(401);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/http-app.test.ts test/websocket-wire.test.ts test/server-package.test.ts`
Expected: FAIL because auth is not enforced

**Step 3: Write minimal implementation**

```ts
function verifyServerKey(candidate?: string) {
  return !config.serverKey || candidate === config.serverKey;
}
```

```ts
app.use("/api", requireServerKey);
wss.on("connection", (socket, request) => {
  if (!verifyServerKey(readKeyFromRequest(request))) {
    socket.close(1008, "Unauthorized");
  }
});
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/http-app.test.ts test/websocket-wire.test.ts test/server-package.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/http/app.ts src/websocket/ws-server.ts src/shared/protocol.ts test/http-app.test.ts test/websocket-wire.test.ts test/server-package.test.ts
git commit -m "feat: add relay server key authentication"
```

### Task 4: Implement the typed websocket client package

**Files:**
- Create: `src/client/relay-client.ts`
- Modify: `src/client/index.ts`
- Modify: `src/shared/protocol.ts`
- Test: `test/client-package.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import WechatKfRelayClient from "../src/client/index.js";

describe("WechatKfRelayClient", () => {
  it("emits typed authenticated and wechat.message events", async () => {
    const client = new WechatKfRelayClient({ url: "ws://127.0.0.1:3000/ws", key: "secret" });
    expect(client.connect).toBeTypeOf("function");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/client-package.test.ts`
Expected: FAIL because the client class does not exist

**Step 3: Write minimal implementation**

```ts
export class WechatKfRelayClient extends EventEmitter {
  async connect() {
    this.socket = new WebSocket(this.urlWithKey);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/client-package.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/client/relay-client.ts src/client/index.ts src/shared/protocol.ts test/client-package.test.ts
git commit -m "feat: add typed relay websocket client"
```

### Task 5: Add package publishing and release version workflows

**Files:**
- Modify: `package.json`
- Create: `.npmignore` or package `files` allowlist in `package.json`
- Create: `.github/workflows/publish.yml`
- Create: `.github/workflows/release-tag.yml`
- Create: `.changeset/config.json` or equivalent versioning config
- Create: `.changeset/*.md`

**Step 1: Write the failing validation**

```bash
pnpm pack --dry-run
```

Expected: Missing dist exports, missing files allowlist, or publish metadata

**Step 2: Implement minimal packaging and workflows**

```json
{
  "name": "wechat-kf-relay",
  "private": false,
  "main": "./dist/server/index.js",
  "types": "./dist/server/index.d.ts",
  "exports": {
    "./server": {
      "types": "./dist/server/index.d.ts",
      "default": "./dist/server/index.js"
    },
    "./client": {
      "types": "./dist/client/index.d.ts",
      "default": "./dist/client/index.js"
    }
  }
}
```

**Step 3: Run validation**

Run: `pnpm build && pnpm pack --dry-run`
Expected: PASS with only publishable files included

**Step 4: Commit**

```bash
git add package.json .github/workflows/publish.yml .github/workflows/release-tag.yml .changeset
git commit -m "chore: add npm publish automation"
```

### Task 6: Update README, verify end-to-end behavior, and publish the branch

**Files:**
- Modify: `README.md`

**Step 1: Update usage docs**

Add:
- standalone `relay.start()` example
- Express mounting example with `relay.handler()`
- websocket client example with `authenticated` and `wechat.message`
- server-key configuration and auth expectations
- npm publishing and release workflow notes

**Step 2: Run the full verification suite**

Run: `pnpm test`
Expected: PASS

Run: `pnpm build`
Expected: PASS

Run: `pnpm pack --dry-run`
Expected: PASS

**Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: add package usage and release guide"
git push
```
