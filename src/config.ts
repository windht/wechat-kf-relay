import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const configSchema = z.object({
  PORT: z.coerce.number().int().min(0).default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_FILE: z.string().min(1).default(".data/logs/relay.log"),
  ECHO_TEST_ENABLED: z
    .union([z.boolean(), z.string(), z.undefined()])
    .optional()
    .transform((value) => value === true || value === "true"),
  ECHO_TEST_PREFIX: z.string().default(""),
  WS_PATH: z.string().min(1).default("/ws"),
  WECHAT_CALLBACK_PATH: z.string().min(1).default("/wechat/callback"),
  STATE_FILE: z.string().min(1).default(".data/wechat-kf-relay-state.json"),
  WECHAT_API_BASE_URL: z.string().url().default("https://qyapi.weixin.qq.com"),
  WECHAT_CORP_ID: z.string().min(1),
  WECHAT_SECRET: z.string().min(1),
  WECHAT_TOKEN: z
    .string()
    .regex(/^[A-Za-z0-9]{1,32}$/, "WECHAT_TOKEN must be alphanumeric and <= 32 chars"),
  WECHAT_ENCODING_AES_KEY: z
    .string()
    .regex(/^[A-Za-z0-9]{43}$/, "WECHAT_ENCODING_AES_KEY must be exactly 43 alphanumeric chars"),
  SERVER_KEY: z.string().min(1).optional(),
});

export interface RelayConfigInput {
  host?: string;
  port?: number;
  wsPath?: string;
  wechatCallbackPath?: string;
  stateFile?: string;
  wechatApiBaseUrl?: string;
  serverKey?: string;
  corpId?: string;
  secret?: string;
  token?: string;
  encodingAesKey?: string;
  log?: {
    level?: "debug" | "info" | "warn" | "error";
    file?: string;
  };
  echoTest?: {
    enabled?: boolean;
    prefix?: string;
  };
  wechat?: {
    corpId?: string;
    secret?: string;
    token?: string;
    encodingAesKey?: string;
  };
}

export interface AppConfig {
  host: string;
  port: number;
  log: {
    level: "debug" | "info" | "warn" | "error";
    file: string;
  };
  echoTest: {
    enabled: boolean;
    prefix: string;
  };
  wsPath: string;
  wechatCallbackPath: string;
  stateFile: string;
  wechatApiBaseUrl: string;
  serverKey?: string;
  wechat: {
    corpId: string;
    secret: string;
    token: string;
    encodingAesKey: string;
  };
}

export function resolveConfig(
  overrides: RelayConfigInput = {},
  env: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = configSchema.parse({
    PORT: overrides.port ?? env.PORT,
    HOST: overrides.host ?? env.HOST,
    LOG_LEVEL: overrides.log?.level ?? env.LOG_LEVEL,
    LOG_FILE: overrides.log?.file ?? env.LOG_FILE,
    ECHO_TEST_ENABLED: overrides.echoTest?.enabled ?? env.ECHO_TEST_ENABLED,
    ECHO_TEST_PREFIX: overrides.echoTest?.prefix ?? env.ECHO_TEST_PREFIX,
    WS_PATH: overrides.wsPath ?? env.WS_PATH,
    WECHAT_CALLBACK_PATH:
      overrides.wechatCallbackPath ?? env.WECHAT_CALLBACK_PATH,
    STATE_FILE: overrides.stateFile ?? env.STATE_FILE,
    WECHAT_API_BASE_URL:
      overrides.wechatApiBaseUrl ?? env.WECHAT_API_BASE_URL,
    WECHAT_CORP_ID: overrides.wechat?.corpId ?? overrides.corpId ?? env.WECHAT_CORP_ID,
    WECHAT_SECRET: overrides.wechat?.secret ?? overrides.secret ?? env.WECHAT_SECRET,
    WECHAT_TOKEN: overrides.wechat?.token ?? overrides.token ?? env.WECHAT_TOKEN,
    WECHAT_ENCODING_AES_KEY:
      overrides.wechat?.encodingAesKey ??
      overrides.encodingAesKey ??
      env.WECHAT_ENCODING_AES_KEY,
    SERVER_KEY: overrides.serverKey ?? env.SERVER_KEY,
  });

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    log: {
      level: parsed.LOG_LEVEL,
      file: parsed.LOG_FILE,
    },
    echoTest: {
      enabled: parsed.ECHO_TEST_ENABLED,
      prefix: parsed.ECHO_TEST_PREFIX,
    },
    wsPath: parsed.WS_PATH,
    wechatCallbackPath: parsed.WECHAT_CALLBACK_PATH,
    stateFile: parsed.STATE_FILE,
    wechatApiBaseUrl: parsed.WECHAT_API_BASE_URL,
    serverKey: parsed.SERVER_KEY,
    wechat: {
      corpId: parsed.WECHAT_CORP_ID,
      secret: parsed.WECHAT_SECRET,
      token: parsed.WECHAT_TOKEN,
      encodingAesKey: parsed.WECHAT_ENCODING_AES_KEY,
    },
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  return resolveConfig({}, env);
}
