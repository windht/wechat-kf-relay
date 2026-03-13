import { serializeError } from "./logging/logger.js";
import WechatKfRelay from "./server/index.js";

const relay = new WechatKfRelay();

await relay.start();

const shutdown = async (signal: string) => {
  try {
    await relay.stop();
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        scope: "shutdown",
        signal,
        error: serializeError(error),
      }),
    );
    process.exit(1);
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
