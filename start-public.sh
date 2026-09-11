#!/usr/bin/env bash
# ===== Ghennai — فتح الرابط العام (نفق مؤقت عبر cloudflared) =====
# يشغّل الخادم (إن لم يعمل) ثم يفتح نفقاً عامًا ويعرض الرابط.
set -euo pipefail
cd "$(dirname "$0")"

echo "[1/3] التأكد من أن الخادم يعمل على :3001…"
if ! curl -sS -o /dev/null "http://localhost:3001/api/health" 2>/dev/null; then
  nohup node server/index.js > server/server.log 2>&1 &
  for i in $(seq 1 20); do
    sleep 1
    curl -sS -o /dev/null "http://localhost:3001/api/health" 2>/dev/null && break
  done
fi
echo "✓ الخادم يعمل"

echo "[2/3] فتح النفق العام…"
pkill -f "cloudflared tunnel --url http://localhost:3001" 2>/dev/null || true
sleep 1
nohup cloudflared tunnel --url http://localhost:3001 > /tmp/opencode/cf.log 2>&1 &
URL=""
for i in $(seq 1 20); do
  sleep 3
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/opencode/cf.log | head -1 || true)
  [[ -n "$URL" ]] && break
done

echo "[3/3] التحقق…"
ok=""
for i in $(seq 1 6); do
  sleep 5
  curl -sS -o /dev/null -w "%{http_code}" "$URL/" 2>/dev/null | grep -qE '200|301|302' && ok=1 && break
done

echo
echo "=========================================================="
echo " 🎉 افتح منصتك من أي جهاز في هذا الرابط:"
echo "    $URL"
[[ "$ok" == "1" ]] && echo "    يعمل ✓"
echo " ⚠️ نفق مؤقت: الرابط يتغير عند إعادة التشغيل، وجهازك يجب أن يظل شغّالاً."
echo "    للنسخة الدائمة (ثابتة + فهرسة Google) استخدم render-deploy.sh"
echo "=========================================================="