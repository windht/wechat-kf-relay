import { describe, expect, it } from "vitest";

describe("package source exports", () => {
  it("resolves the server and client entrypoints", async () => {
    const serverModule = await import("../src/server/index.js");
    const clientModule = await import("../src/client/index.js");

    expect(serverModule.default).toBeTypeOf("function");
    expect(clientModule.default).toBeTypeOf("function");
  });
});
