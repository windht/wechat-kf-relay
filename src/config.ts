import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  LOG_FILE: z.string().min(1).default(".data/logs/relay.log"),
  ECHO_TEST_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
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
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = configSchema.parse(env);

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
    wechat: {
      corpId: parsed.WECHAT_CORP_ID,
      secret: parsed.WECHAT_SECRET,
      token: parsed.WECHAT_TOKEN,
      encodingAesKey: parsed.WECHAT_ENCODING_AES_KEY,
    },
  };
}
