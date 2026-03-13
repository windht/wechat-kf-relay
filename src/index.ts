import http from "node:http";

import { loadConfig } from "./config.js";
import { createApp } from "./http/app.js";
import { createLogger, serializeError } from "./logging/logger.js";
import { RelayService } from "./relay/relay-service.js";
import { FileRelayStateStore } from "./relay/state-store.js";
import { WechatKfApiClient } from "./wechat/api.js";
import { createRelayWebSocketServer } from "./websocket/ws-server.js";

const config = loadConfig();
const logger = createLogger({
  level: config.log.level,
  file: config.log.file,
});
const stateStore = new FileRelayStateStore(config.stateFile, logger.child("state"));
await stateStore.init();

let websocketServer:
  | ReturnType<typeof createRelayWebSocketServer>
  | undefined;

const relayService = new RelayService({
  apiClient: new WechatKfApiClient({
    baseUrl: config.wechatApiBaseUrl,
    corpId: config.wechat.corpId,
    secret: config.wechat.secret,
  }, logger.child("wechatApi")),
  stateStore,
  broadcast: (event) => {
    websocketServer?.broadcast(event);
  },
  logger: logger.child("relay"),
  echoTest: config.echoTest,
});

const app = createApp({
  config,
  relayService,
  logger: logger.child("http"),
});
const server = http.createServer(app);

websocketServer = createRelayWebSocketServer({
  server,
  path: config.wsPath,
  relayService,
  logger: logger.child("ws"),
});

server.listen(config.port, config.host, () => {
  logger.info("WeChat KF relay is listening", {
    http: `http://${config.host}:${config.port}`,
    callbackPath: config.wechatCallbackPath,
    wsPath: config.wsPath,
    logFile: config.log.file,
    logLevel: config.log.level,
    echoTestEnabled: config.echoTest.enabled,
    echoTestPrefix: config.echoTest.prefix,
  });
});

server.on("error", (error) => {
  logger.error("HTTP server error", {
    error: serializeError(error),
  });
});

const shutdown = async (signal: string) => {
  logger.info("Received shutdown signal", {
    signal,
  });

  await websocketServer?.close();
  server.close((error) => {
    if (error) {
      logger.error("Error while closing HTTP server", {
        error: serializeError(error),
      });
      process.exit(1);
      return;
    }

    void logger.close().finally(() => {
      process.exit(0);
    });
  });
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
