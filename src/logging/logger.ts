import fs from "node:fs";
import path from "node:path";

const levelWeight = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const;

type LogLevel = keyof typeof levelWeight;

type LogValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LogValue[]
  | { [key: string]: LogValue };

type LogContext = Record<string, LogValue>;

interface LoggerOptions {
  level: LogLevel;
  file: string;
  scope?: string;
  bindings?: LogContext;
}

export interface Logger {
  child(scope: string, bindings?: LogContext): Logger;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  close(): Promise<void>;
}

class FileBackedLogger implements Logger {
  private readonly stream: fs.WriteStream;
  private readonly level: LogLevel;
  private readonly scope?: string;
  private readonly bindings: LogContext;

  constructor(options: LoggerOptions, stream?: fs.WriteStream) {
    this.level = options.level;
    this.scope = options.scope;
    this.bindings = options.bindings ?? {};

    if (stream) {
      this.stream = stream;
      return;
    }

    const absoluteFile = path.resolve(options.file);
    fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });
    this.stream = fs.createWriteStream(absoluteFile, {
      flags: "a",
      encoding: "utf8",
    });
  }

  child(scope: string, bindings?: LogContext) {
    return new FileBackedLogger(
      {
        level: this.level,
        file: this.stream.path.toString(),
        scope: [this.scope, scope].filter(Boolean).join("."),
        bindings: {
          ...this.bindings,
          ...bindings,
        },
      },
      this.stream,
    );
  }

  debug(message: string, context?: LogContext) {
    this.write("debug", message, context);
  }

  info(message: string, context?: LogContext) {
    this.write("info", message, context);
  }

  warn(message: string, context?: LogContext) {
    this.write("warn", message, context);
  }

  error(message: string, context?: LogContext) {
    this.write("error", message, context);
  }

  async close() {
    await new Promise<void>((resolve) => {
      this.stream.end(resolve);
    });
  }

  private write(level: LogLevel, message: string, context?: LogContext) {
    if (levelWeight[level] < levelWeight[this.level]) {
      return;
    }

    const record = {
      ts: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      ...this.bindings,
      ...(context ?? {}),
    };
    const line = JSON.stringify(record);

    this.stream.write(`${line}\n`);

    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }
}

export function createLogger(options: { level: LogLevel; file: string }) {
  return new FileBackedLogger(options);
}

export const noopLogger: Logger = {
  child() {
    return noopLogger;
  },
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}
