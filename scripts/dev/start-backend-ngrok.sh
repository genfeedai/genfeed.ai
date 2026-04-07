#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.local"
NGROK_API="http://127.0.0.1:4040/api/tunnels"
PORT="${1:-3010}"
LOG_FILE="${TMPDIR:-/tmp}/genfeed-backend-ngrok.log"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env.local not found at $ENV_FILE"
  exit 1
fi

cleanup_existing_ngrok() {
  local pids
  pids="$(pgrep -f "ngrok http $PORT" || true)"
  if [[ -n "$pids" ]]; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" >/dev/null 2>&1 || true
    done <<< "$pids"
    sleep 1
  fi
}

update_env_file() {
  local public_url="$1"
  local tmp_file
  tmp_file="$(mktemp)"

  node - "$ENV_FILE" "$public_url" "$tmp_file" <<'NODE'
const fs = require('fs');

const envFile = process.argv[2];
const publicUrl = process.argv[3];
const tmpFile = process.argv[4];

const content = fs.readFileSync(envFile, 'utf8');
const line = `GENFEEDAI_WEBHOOKS_URL=${publicUrl}`;

if (/^GENFEEDAI_WEBHOOKS_URL=.*$/m.test(content)) {
  fs.writeFileSync(
    tmpFile,
    content.replace(/^GENFEEDAI_WEBHOOKS_URL=.*$/m, line),
    'utf8',
  );
} else {
  const suffix = content.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(tmpFile, `${content}${suffix}${line}\n`, 'utf8');
}
NODE

  mv "$tmp_file" "$ENV_FILE"
}

fetch_public_url() {
  node - "$NGROK_API" <<'NODE'
const http = require('http');

const url = process.argv[2];

http.get(url, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const tunnel = (parsed.tunnels || []).find((item) => item.proto === 'https');
      if (!tunnel || !tunnel.public_url) {
        process.exit(2);
      }
      process.stdout.write(tunnel.public_url);
    } catch {
      process.exit(3);
    }
  });
}).on('error', () => process.exit(4));
NODE
}

cleanup_existing_ngrok

nohup ngrok http "$PORT" >"$LOG_FILE" 2>&1 &
NGROK_PID=$!

PUBLIC_URL=""
for _ in $(seq 1 20); do
  if PUBLIC_URL="$(fetch_public_url 2>/dev/null)"; then
    break
  fi
  sleep 1
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "Failed to get ngrok public URL."
  echo "Check auth first: ngrok config add-authtoken <token>"
  echo "Recent log:"
  tail -n 20 "$LOG_FILE" || true
  exit 1
fi

update_env_file "$PUBLIC_URL"

echo "ngrok pid: $NGROK_PID"
echo "ngrok public url: $PUBLIC_URL"
echo "updated: $ENV_FILE"
echo "replicate callback: $PUBLIC_URL/v1/webhooks/replicate/callback"
