#!/bin/sh
set -eu

if [ -z "${ZCODE_WEB_TOKEN:-}" ]; then
  echo 'ERROR: ZCODE_WEB_TOKEN is required. Refusing to start without authentication.' >&2
  exit 1
fi

exec node /opt/zcode/bin/zcode.mjs --web \
  --workspace /workspace \
  --host 0.0.0.0 \
  --port 3030 \
  --no-open \
  --token "$ZCODE_WEB_TOKEN"
