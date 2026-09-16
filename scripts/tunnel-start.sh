#!/usr/bin/env bash
# بدء تونل cloudflared معزولًا تمامًا عن الجلسة (يُشغَّل مرة واحدة):
#   setsid nohup bash scripts/tunnel-start.sh </dev/null >/dev/null 2>&1 &
## فيبقى التونل حيًا حتى لو قفلت جلسة الطرفية
set -u
PORT="${PORT:-3002}"
LOG="${TUNNEL_LOG:-/tmp/opencode/cf-tunnel.log}"
exec setsid cloudflared tunnel --url "http://localhost:${PORT}" --no-autoupdate --logfile "$LOG" >/dev/null 2>&1