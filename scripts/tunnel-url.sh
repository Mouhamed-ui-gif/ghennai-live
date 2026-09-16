#!/usr/bin/env bash
# طباعة رابط التونل الحالي (من سجل cloudflared أو ملف الحالة)
set -u
STATE="${STATE_FILE:-$(dirname "$0")/../server/data/tunnel.json}"
LOG="${LOGFILE:-$(dirname "$0")/../tmp-cloudflared.log}"
if [ -s "$STATE" ]; then
  grep -o '"url": *"[^"]*"' "$STATE" | sed 's/.*"url": *"\([^"]*\)".*/\1/'
elif [ -s "$LOG" ]; then
  grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | tail -1
fi