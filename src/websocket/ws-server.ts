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
  const sockets = new Map<
    string,
    {
      socket: WebSocket;
      subscribedOpenKfId?: string;
    }
  >();
  const ready = input.ready ?? Promise.resolve();
  let wss: WebSocketServer | undefined;
  let attachedServer: HttpServer | undefined;

  const send = (socket: WebSocket, payload: unknown) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  const broadcast = (payload: RelayServerEvent) => {
    for (const connection of sockets.values()) {
      if (!shouldDeliverEvent(connection.subscribedOpenKfId, payload)) {
        continue;
      }

      send(connection.socket, toWireRelayEvent(payload));
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
      const connectionState: {
        socket: WebSocket;
        subscribedOpenKfId?: string;
      } = {
        socket,
      };
      sockets.set(clientId, connectionState);
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
          sendSnapshot(socket, connectionState.subscribedOpenKfId);
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
            sendSnapshot(socket, connectionState.subscribedOpenKfId);
            return;
          }

          if (command.type === "subscribe") {
            if (!input.relayService.hasKfAccount(command.message.open_kfid)) {
              throw new Error(`Unknown WeChat kf account: ${command.message.open_kfid}`);
            }

            connectionState.subscribedOpenKfId = command.message.open_kfid;
            input.logger.info("WebSocket client subscribed to WeChat kf", {
              clientId,
              openKfId: connectionState.subscribedOpenKfId,
            });
            send(socket, envelope("subscribed", {
              open_kfid: command.message.open_kfid,
            }));
            sendSnapshot(socket, connectionState.subscribedOpenKfId);
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

          if (command.type === "message_on_event") {
            const subscribedOpenKfId = requireSubscribedOpenKfId(connectionState);

            if (
              !input.relayService.canReplyToEventCode(
                subscribedOpenKfId,
                command.message.code,
              )
            ) {
              throw new Error(
                `message_on_event is limited to the subscribed open_kfid ${subscribedOpenKfId}`,
              );
            }

            const result = await input.relayService.sendMessageOnEvent({
              code: command.message.code,
              content: command.message.content,
              msgid: command.message.msgid,
            });
            send(socket, envelope("message_on_event.result", { ...result }));
            return;
          }

          const subscribedOpenKfId = requireSubscribedOpenKfId(connectionState);
          if (command.message.open_kfid !== subscribedOpenKfId) {
            throw new Error(
              `send_text is limited to the subscribed open_kfid ${subscribedOpenKfId}`,
            );
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

  const sendSnapshot = (socket: WebSocket, openKfId?: string) => {
    send(
      socket,
      envelope(
        "snapshot",
        toWireSnapshot(
          input.relayService.getSnapshot({
            openKfId,
            requireSubscription: true,
          }),
        ),
      ),
    );
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
      for (const connection of sockets.values()) {
        connection.socket.close();
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

function requireSubscribedOpenKfId(input: { subscribedOpenKfId?: string }) {
  if (!input.subscribedOpenKfId) {
    throw new Error("Subscribe to an open_kfid before sending account-scoped commands");
  }

  return input.subscribedOpenKfId;
}

function shouldDeliverEvent(
  subscribedOpenKfId: string | undefined,
  event: RelayServerEvent,
) {
  const eventOpenKfId = getEventOpenKfId(event);
  if (!eventOpenKfId) {
    return true;
  }

  return subscribedOpenKfId === eventOpenKfId;
}

function getEventOpenKfId(event: RelayServerEvent) {
  if (event.type === "wechat.message") {
    return event.message.openKfId;
  }

  if (event.type === "wechat.enter_session") {
    return event.event.openKfId;
  }

  if (event.type === "wechat.outbound.sent") {
    return event.request.open_kfid;
  }

  if (event.type === "wechat.callback") {
    return event.callback.OpenKfId;
  }

  if (event.type === "subscribed") {
    return event.openKfId;
  }

  return undefined;
}
