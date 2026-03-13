import type { IncomingMessage } from "node:http";

export const RELAY_SERVER_KEY_HEADER = "x-wechat-relay-key";
export const RELAY_SERVER_KEY_QUERY_PARAM = "server_key";

export function isServerKeyAuthorized(
  expectedServerKey: string | undefined,
  candidateServerKey: string | undefined,
) {
  if (!expectedServerKey) {
    return true;
  }

  return candidateServerKey === expectedServerKey;
}

export function readServerKeyFromNodeRequest(request: IncomingMessage) {
  const headerValue = request.headers[RELAY_SERVER_KEY_HEADER];

  if (typeof headerValue === "string" && headerValue.length > 0) {
    return headerValue;
  }

  if (Array.isArray(headerValue) && headerValue[0]) {
    return headerValue[0];
  }

  const url = new URL(request.url ?? "/", "http://relay.local");
  const queryValue = url.searchParams.get(RELAY_SERVER_KEY_QUERY_PARAM);

  return queryValue && queryValue.length > 0 ? queryValue : undefined;
}

export function readServerKeyFromHttpRequest(input: {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  body?: unknown;
}) {
  const headerValue = input.headers[RELAY_SERVER_KEY_HEADER];

  if (typeof headerValue === "string" && headerValue.length > 0) {
    return headerValue;
  }

  if (Array.isArray(headerValue) && typeof headerValue[0] === "string") {
    return headerValue[0];
  }

  const queryValue = input.query[RELAY_SERVER_KEY_QUERY_PARAM];
  if (typeof queryValue === "string" && queryValue.length > 0) {
    return queryValue;
  }

  if (
    input.body &&
    typeof input.body === "object" &&
    RELAY_SERVER_KEY_QUERY_PARAM in input.body &&
    typeof (input.body as Record<string, unknown>)[RELAY_SERVER_KEY_QUERY_PARAM] ===
      "string"
  ) {
    const bodyValue = (input.body as Record<string, unknown>)[
      RELAY_SERVER_KEY_QUERY_PARAM
    ] as string;

    return bodyValue.length > 0 ? bodyValue : undefined;
  }

  return undefined;
}
