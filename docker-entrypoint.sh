#!/bin/sh
set -eu

if [ -n "${ZCODE_WEB_TOKEN:-}" ]; then
  exec node /opt/zcode/bin/zcode.mjs --web \
    --workspace /workspace \
    --host 0.0.0.0 \
    --port 3030 \
    --no-open \
    --token "$ZCODE_WEB_TOKEN"
fi

exec node /opt/zcode/bin/zcode.mjs --web \
  --workspace /workspace \
  --host 0.0.0.0 \
  --port 3030 \
  --no-open \
  --no-token
