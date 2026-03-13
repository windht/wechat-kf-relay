import http, { type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import type { Express } from "express";

import { resolveConfig, type AppConfig, type RelayConfigInput } from "../config.js";
import { createApp } from "../http/app.js";
import {
  createLogger,
  serializeError,
  type Logger,
} from "../logging/logger.js";
import { RelayService } from "../relay/relay-service.js";
import {
  FileRelayStateStore,
  type RelayStateStore,
} from "../relay/state-store.js";
import { WechatKfApiClient, type RelayApiClient } from "../wechat/api.js";
import {
  createRelayWebSocketServer,
  type RelayWebSocketServer,
} from "../websocket/ws-server.js";

export interface WechatKfRelayOptions extends RelayConfigInput {
  logger?: Logger;
  apiClient?: RelayApiClient;
  stateStore?: RelayStateStore;
  fetch?: typeof fetch;
}

export interface RelayStartResult {
  server: HttpServer;
  host: string;
  port: number;
  httpBaseUrl: string;
  wsUrl: string;
}

export class WechatKfRelay {
  private readonly config: AppConfig;
  private readonly logger: Logger;
  private readonly ownsLogger: boolean;
  private readonly relayService: RelayService;
  private readonly websocketServer: RelayWebSocketServer;
  private readonly readyPromise: Promise<void>;
  private readonly app: Express;
  private server: HttpServer | undefined;
  private ownsServer = false;
  private errorListenerBound = false;

  constructor(options: WechatKfRelayOptions = {}) {
    this.config = resolveConfig(options);
    this.ownsLogger = !options.logger;
    this.logger =
      options.logger ??
      createLogger({
        level: this.config.log.level,
        file: this.config.log.file,
      });

    const stateStore =
      options.stateStore ??
      new FileRelayStateStore(this.config.stateFile, this.logger.child("state"));
    this.readyPromise = Promise.resolve(stateStore.init?.()).then(() => undefined);

    const apiClient =
      options.apiClient ??
      new WechatKfApiClient(
        {
          baseUrl: this.config.wechatApiBaseUrl,
          corpId: this.config.wechat.corpId,
          secret: this.config.wechat.secret,
        },
        this.logger.child("wechatApi"),
        options.fetch ?? fetch,
      );

    let websocketServerRef: RelayWebSocketServer | undefined;
    this.relayService = new RelayService({
      apiClient,
      stateStore,
      broadcast: (event) => {
        websocketServerRef?.broadcast(event);
      },
      logger: this.logger.child("relay"),
      echoTest: this.config.echoTest,
    });

    this.websocketServer = createRelayWebSocketServer({
      path: this.config.wsPath,
      relayService: this.relayService,
      logger: this.logger.child("ws"),
      serverKey: this.config.serverKey,
      ready: this.readyPromise,
    });
    websocketServerRef = this.websocketServer;

    this.app = createApp({
      config: this.config,
      relayService: this.relayService,
      logger: this.logger.child("http"),
      ready: this.readyPromise,
    });
  }

  handler() {
    return this.app;
  }

  getConfig() {
    return structuredClone(this.config);
  }

  attach(server: HttpServer) {
    if (this.server && this.server !== server) {
      throw new Error("Relay is already attached to another HTTP server");
    }

    this.server = server;
    this.websocketServer.attach(server);
    this.bindServerErrorLogging(server);

    return server;
  }

  async start() {
    if (this.server) {
      return this.describeServer(this.server);
    }

    await this.readyPromise;

    const server = http.createServer(this.app);
    this.server = server;
    this.ownsServer = true;
    this.websocketServer.attach(server);
    this.bindServerErrorLogging(server);

    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error) => {
        reject(error);
      };
      const handleListening = () => {
        server.off("error", handleError);
        resolve();
      };

      server.once("error", handleError);
      server.listen(this.config.port, this.config.host, () => {
        handleListening();
      });
    });

    const info = this.describeServer(server);
    this.logger.info("WeChat KF relay is listening", {
      http: info.httpBaseUrl,
      wsUrl: info.wsUrl,
      callbackPath: this.config.wechatCallbackPath,
      logFile: this.config.log.file,
      logLevel: this.config.log.level,
      echoTestEnabled: this.config.echoTest.enabled,
      echoTestPrefix: this.config.echoTest.prefix,
    });

    return info;
  }

  async stop() {
    await this.websocketServer.close();

    if (this.server && this.ownsServer) {
      const server = this.server;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    this.server = undefined;
    this.ownsServer = false;

    if (this.ownsLogger) {
      await this.logger.close();
    }
  }

  private bindServerErrorLogging(server: HttpServer) {
    if (this.errorListenerBound) {
      return;
    }

    this.errorListenerBound = true;
    server.on("error", (error) => {
      this.logger.error("HTTP server error", {
        error: serializeError(error),
      });
    });
  }

  private describeServer(server: HttpServer): RelayStartResult {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Relay server address is not available");
    }

    const host = normalizePublicHost(address, this.config.host);
    const httpBaseUrl = `http://${host}:${address.port}`;

    return {
      server,
      host,
      port: address.port,
      httpBaseUrl,
      wsUrl: `${httpBaseUrl}${this.config.wsPath}`,
    };
  }
}

function normalizePublicHost(address: AddressInfo, configuredHost: string) {
  if (
    configuredHost === "0.0.0.0" ||
    configuredHost === "::" ||
    address.address === "::" ||
    address.address === "0.0.0.0"
  ) {
    return "127.0.0.1";
  }

  return address.address;
}

export default WechatKfRelay;
