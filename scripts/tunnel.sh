#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it first, for example with: brew install cloudflared" >&2
  exit 1
fi

exec cloudflared tunnel --url "http://127.0.0.1:${PORT}"
