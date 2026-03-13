import { EventEmitter } from "node:events";

import WebSocket from "ws";

import { RELAY_SERVER_KEY_HEADER } from "../shared/auth.js";
import {
  createCommand,
  parseRelayServerMessage,
  type RelayClientCommand,
  type RelayMessageOnEventPayload,
  type RelaySendTextPayload,
  type RelayServerMessage,
  type RelayServerMessageMap,
} from "../shared/protocol.js";

export interface WechatKfRelayClientOptions {
  url: string;
  key?: string;
  webSocketImpl?: typeof WebSocket;
}

export interface RelayClientLifecycleEvents {
  open: {
    url: string;
  };
  close: {
    code: number;
    reason: string;
  };
  "socket.error": Error;
  message: RelayServerMessage;
}

export interface RelayClientEventMap
  extends RelayServerMessageMap,
    RelayClientLifecycleEvents {}

export class WechatKfRelayClient extends EventEmitter {
  private socket: WebSocket | undefined;
  private readonly webSocketImpl: typeof WebSocket;

  constructor(private readonly options: WechatKfRelayClientOptions) {
    super();
    this.webSocketImpl = options.webSocketImpl ?? WebSocket;
  }

  override on<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void,
  ): this;
  override on(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(eventName, listener);
  }

  override once<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void,
  ): this;
  override once(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.once(eventName, listener);
  }

  override off<EventName extends keyof RelayClientEventMap>(
    eventName: EventName,
    listener: (payload: RelayClientEventMap[EventName]) => void,
  ): this;
  override off(eventName: string | symbol, listener: (...args: any[]) => void): this {
    return super.off(eventName, listener);
  }

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === this.webSocketImpl.OPEN ||
        this.socket.readyState === this.webSocketImpl.CONNECTING)
    ) {
      return;
    }

    const url = new URL(this.options.url);

    const socket = new this.webSocketImpl(url, {
      headers: this.options.key
        ? {
            [RELAY_SERVER_KEY_HEADER]: this.options.key,
          }
        : undefined,
    });

    this.socket = socket;

    socket.on("open", () => {
      this.emit("open", {
        url: url.toString(),
      });
    });

    socket.on("message", (payload) => {
      try {
        const raw = JSON.parse(payload.toString());
        const message = parseRelayServerMessage(raw);

        this.emit("message", message);
        this.emit(message.type, message.message);
      } catch (error) {
        this.emit("socket.error", toError(error));
      }
    });

    socket.on("error", (error) => {
      this.emit("socket.error", toError(error));
    });

    socket.on("close", (code, reason) => {
      if (this.socket === socket) {
        this.socket = undefined;
      }

      this.emit("close", {
        code,
        reason: reason.toString(),
      });
    });
  }

  disconnect(code?: number, reason?: string) {
    this.socket?.close(code, reason);
  }

  ping() {
    this.sendCommand(createCommand("ping", {}));
  }

  getSnapshot() {
    this.sendCommand(createCommand("get_snapshot", {}));
  }

  syncNow(token?: string) {
    this.sendCommand(
      createCommand("sync_now", {
        token,
      }),
    );
  }

  sendText(payload: RelaySendTextPayload) {
    this.sendCommand(createCommand("send_text", payload));
  }

  messageOnEvent(payload: RelayMessageOnEventPayload) {
    this.sendCommand(createCommand("message_on_event", payload));
  }

  private sendCommand(command: RelayClientCommand) {
    if (!this.socket || this.socket.readyState !== this.webSocketImpl.OPEN) {
      throw new Error("Relay websocket is not connected");
    }

    this.socket.send(JSON.stringify(command));
  }
}

function toError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

export default WechatKfRelayClient;
