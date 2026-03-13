# WeChat KF Relay Bootstrap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local Node.js relay service that can verify and receive WeChat KF callbacks, pull message details via `kf/sync_msg`, send plain-text replies via `kf/send_msg`, and expose a websocket bridge for other local clients.

**Architecture:** Use an Express HTTP server for the callback and helper APIs, plus a `ws` websocket server mounted on the same Node process. Implement WeChat KF signature verification and AES-CBC message decrypt/encrypt in a dedicated crypto module, then route normalized inbound events into a relay service that broadcasts to websocket clients and can also send outbound text replies through the WeChat KF HTTP API.

**Tech Stack:** Node.js 22, TypeScript, Express, ws, Zod, xml2js, Vitest

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`
- Create: `src/index.ts`
- Create: `src/config.ts`

**Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from "vitest";

describe("config", () => {
  it("loads defaults for optional ports", async () => {
    const { loadConfig } = await import("../src/config");
    expect(() => loadConfig()).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run`
Expected: FAIL with missing files/modules

**Step 3: Write minimal implementation**

```ts
export function loadConfig() {
  return {
    port: Number(process.env.PORT ?? 3000),
    websocketPath: process.env.WS_PATH ?? "/ws",
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example README.md src/index.ts src/config.ts
git commit -m "feat: scaffold wechat kf relay project"
```

### Task 2: Implement WeChat KF crypto helpers

**Files:**
- Create: `src/wechat/crypto.ts`
- Create: `src/wechat/xml.ts`
- Test: `test/wechat-crypto.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { sha1Signature } from "../src/wechat/crypto";

describe("sha1Signature", () => {
  it("sorts values before hashing", () => {
    expect(sha1Signature("token", "3", "1", "2")).toHaveLength(40);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/wechat-crypto.test.ts`
Expected: FAIL with missing module

**Step 3: Write minimal implementation**

```ts
import { createHash } from "node:crypto";

export function sha1Signature(...parts: string[]) {
  return createHash("sha1")
    .update(parts.sort().join(""), "utf8")
    .digest("hex");
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/wechat-crypto.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wechat/crypto.ts src/wechat/xml.ts test/wechat-crypto.test.ts
git commit -m "feat: add wechat callback crypto helpers"
```

### Task 3: Implement access token, sync-msg, and send-msg clients

**Files:**
- Create: `src/wechat/api.ts`
- Create: `src/wechat/types.ts`
- Test: `test/wechat-api.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildTextReplyPayload } from "../src/wechat/api";

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
      msgtype: "text",
      text: { content: "hello" },
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/wechat-api.test.ts`
Expected: FAIL with missing module

**Step 3: Write minimal implementation**

```ts
export function buildTextReplyPayload(input: {
  touser: string;
  openKfId: string;
  content: string;
}) {
  return {
    touser: input.touser,
    open_kfid: input.openKfId,
    msgtype: "text",
    text: { content: input.content },
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/wechat-api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/wechat/api.ts src/wechat/types.ts test/wechat-api.test.ts
git commit -m "feat: add wechat kf api client"
```

### Task 4: Implement relay orchestration and websocket bridge

**Files:**
- Create: `src/relay/store.ts`
- Create: `src/relay/service.ts`
- Create: `src/websocket/server.ts`
- Test: `test/relay-service.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { createConnectionRegistry } from "../src/relay/store";

describe("createConnectionRegistry", () => {
  it("starts with zero clients", () => {
    expect(createConnectionRegistry().count()).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/relay-service.test.ts`
Expected: FAIL with missing module

**Step 3: Write minimal implementation**

```ts
export function createConnectionRegistry() {
  const sockets = new Set();
  return {
    count: () => sockets.size,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/relay-service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/relay/store.ts src/relay/service.ts src/websocket/server.ts test/relay-service.test.ts
git commit -m "feat: add websocket relay service"
```

### Task 5: Implement HTTP routes and end-to-end local flow

**Files:**
- Create: `src/http/app.ts`
- Modify: `src/index.ts`
- Test: `test/http-app.test.ts`

**Step 1: Write the failing test**

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = createApp({} as never);
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/http-app.test.ts`
Expected: FAIL with missing module

**Step 3: Write minimal implementation**

```ts
import express from "express";

export function createApp() {
  const app = express();
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/http-app.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/http/app.ts src/index.ts test/http-app.test.ts
git commit -m "feat: add relay http routes"
```

### Task 6: Document tunnel and manual verification flow

**Files:**
- Modify: `README.md`
- Create: `scripts/tunnel.sh`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("README", () => {
  it("documents the callback endpoint", () => {
    expect(readFileSync("README.md", "utf8")).toContain("/wechat/callback");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run`
Expected: FAIL because docs are incomplete

**Step 3: Write minimal implementation**

```md
## Tunnel

Use `cloudflared tunnel --url http://localhost:3000`.
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add README.md scripts/tunnel.sh
git commit -m "docs: add tunnel and testing guide"
```
