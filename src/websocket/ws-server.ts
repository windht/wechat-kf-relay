import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";

import { WebSocket, WebSocketServer } from "ws";

import type { Logger } from "../logging/logger.js";
import type { RelayService, RelayServerEvent } from "../relay/relay-service.js";
import { isServerKeyAuthorized, readServerKeyFromNodeRequest } from "../shared/auth.js";
import {
  envelope,
  parseRelayCommand,
  toWireRelayEvent,
  toWireSnapshot,
} from "../shared/protocol.js";

export interface RelayWebSocketServer {
  attach(server: HttpServer): void;
  broadcast(event: RelayServerEvent): void;
  getClientCount(): number;
  close(): Promise<void>;
}

export function createRelayWebSocketServer(input: {
  path: string;
  relayService: RelayService;
  logger: Logger;
  serverKey?: string;
  ready?: Promise<void>;
}): RelayWebSocketServer {
  const sockets = new Map<string, WebSocket>();
  const ready = input.ready ?? Promise.resolve();
  let wss: WebSocketServer | undefined;
  let attachedServer: HttpServer | undefined;

  const send = (socket: WebSocket, payload: unknown) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  const broadcast = (payload: RelayServerEvent) => {
    for (const socket of sockets.values()) {
      send(socket, toWireRelayEvent(payload));
    }
  };

  const bind = (server: HttpServer) => {
    if (wss) {
      return;
    }

    attachedServer = server;
    wss = new WebSocketServer({
      server,
      path: input.path,
      verifyClient: (info, done) => {
        const serverKey = readServerKeyFromNodeRequest(info.req);
        const authorized = isServerKeyAuthorized(input.serverKey, serverKey);

        if (!authorized) {
          input.logger.warn("Rejected unauthorized WebSocket connection", {
            path: input.path,
          });
        }

        done(authorized, authorized ? 200 : 401, authorized ? "OK" : "Unauthorized");
      },
    });

    wss.on("connection", (socket) => {
      const clientId = randomUUID();
      sockets.set(clientId, socket);
      input.logger.info("WebSocket client connected", {
        clientId,
        path: input.path,
        clientCount: sockets.size,
      });

      void ready
        .then(() => {
          send(socket, envelope("authenticated", {
            client_id: clientId,
            ws_path: input.path,
          }));
          send(
            socket,
            envelope("snapshot", toWireSnapshot(input.relayService.getSnapshot())),
          );
        })
        .catch((error) => {
          const messageText =
            error instanceof Error ? error.message : "Relay initialization failed";
          send(socket, envelope("relay.error", {
            error: messageText,
          }));
          socket.close(1011, messageText);
        });

      socket.on("message", async (message) => {
        try {
          await ready;

          const raw = JSON.parse(message.toString());
          const command = parseRelayCommand(raw);
          input.logger.info("WebSocket command received", {
            clientId,
            commandType: command.type,
          });

          if (command.type === "ping") {
            send(socket, envelope("pong", {
              timestamp_ms: Date.now(),
            }));
            return;
          }

          if (command.type === "get_snapshot") {
            send(
              socket,
              envelope("snapshot", toWireSnapshot(input.relayService.getSnapshot())),
            );
            return;
          }

          if (command.type === "sync_now") {
            const result = await input.relayService.syncNow({
              callbackToken: command.message.token,
            });
            send(socket, envelope("sync_now.result", {
              synced_count: result.syncedCount,
              next_cursor: result.nextCursor,
            }));
            return;
          }

          const result = await input.relayService.sendTextMessage({
            touser: command.message.external_userid ?? command.message.touser ?? "",
            openKfId: command.message.open_kfid,
            content: command.message.content,
            msgid: command.message.msgid,
          });
          send(socket, envelope("send_text.result", { ...result }));
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "Unknown websocket command error";
          input.logger.warn("WebSocket command failed", {
            clientId,
            error: messageText,
          });

          send(socket, envelope("relay.error", {
            error: messageText,
          }));
        }
      });

      socket.on("close", () => {
        sockets.delete(clientId);
        input.logger.info("WebSocket client disconnected", {
          clientId,
          clientCount: sockets.size,
        });
      });
    });
  };

  return {
    attach(server) {
      if (attachedServer && attachedServer !== server) {
        throw new Error("WebSocket relay is already attached to another HTTP server");
      }

      bind(server);
    },
    broadcast,
    getClientCount() {
      return sockets.size;
    },
    async close() {
      for (const socket of sockets.values()) {
        socket.close();
      }

      if (!wss) {
        return;
      }

      await new Promise<void>((resolve, reject) => {
        wss?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      sockets.clear();
      wss = undefined;
      attachedServer = undefined;
    },
  };
}
