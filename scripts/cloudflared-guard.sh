#!/usr/bin/env bash
# حارس تونل cloudflared: يضمن بقاء التونل حيًا ويسجل رابطًا مستقرًا
# يُشغَّل مرة واحدة في الخلفية:  setsid nohup bash scripts/cloudflared-guard.sh &
set -u

PORT="${PORT:-3002}"
TUNNEL_LOG="${TUNNEL_LOG:-/tmp/opencode/cloudflared-guard.log}"
STATE_FILE="${STATE_FILE:-$(dirname "$0")/../server/data/tunnel.json}"
LOGFILE="$(dirname "$0")/../tmp-cloudflared.log"

mkdir -p "$(dirname "$TUNNEL_LOG")" "$(dirname "$STATE_FILE")"

log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" >>"$TUNNEL_LOG"; }

# قراءة الرابط الحالي من سجل cloudflared (سجلات المشروع في /tmp/opencode)
current_url() {
  local u
  u="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/opencode/cf-tunnel.log 2>/dev/null | tail -1)"
  [ -n "$u" ] && { echo "$u"; return; }
  u="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGFILE" 2>/dev/null | tail -1)"
  [ -n "$u" ] && { echo "$u"; return; }
  grep -Eoh 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/opencode/cf*.log 2>/dev/null | tail -1
}

# كتابة حالة في ملف بيانات الخادم (server/data/tunnel.json)
record() {
  printf '{ "url": "%s", "updatedAt": %s, "pid": %s }\n' "$1" "$(date +%s%3N)" "$$" >"$STATE_FILE"
}

ensure_tunnel() {
  if pgrep -f 'cloudflared tunnel --url' >/dev/null 2>&1; then
    URL="$(current_url)"
    [ -n "$URL" ] && record "$URL" || log "التونل يعمل بلا رابط في السجل بعد"
    return 0
  fi
  log "التونل غير مستجيب — إعادة التشغيل بواسطة systemd…"
  systemctl --user restart cloudflared-tunnel 2>/dev/null || setsid bash scripts/tunnel-start.sh </dev/null >/dev/null 2>&1 &
  sleep $((RANDOM % 8 + 12))
  URL="$(current_url)"
  if [ -n "$URL" ]; then
    record "$URL"
    log "رابط تونل جديد: $URL"
  else
    log "لم يظهر الرابط بعد — سنعيد المحاولة في الدورة التالية"
  fi
}

RECORDED=""
while true; do
  FILEM=$(stat -c %Y "$STATE_FILE" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  AGE=$((NOW - FILEM))
  if [ "$AGE" -gt 300 ] || [ ! -s "$STATE_FILE" ]; then
    ensure_tunnel
  else
    # تحديث الطابع الزمني فقط (الرابط ثابت)
    record "$(current_url)"
  fi
  sleep 30
done