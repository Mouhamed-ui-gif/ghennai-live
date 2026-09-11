#!/usr/bin/env bash
# ===== Ghennai — النشر التلقائي على Render (استضافة مجانية) =====
# الاستخدام:
#   RENDER_API_KEY=rnd_xxx GEMINI_API_KEY=AIza... ./render-deploy.sh
#   RENDER_API_KEY=rnd_xxx GROQ_API_KEY=gsk_... ./render-deploy.sh
# تحصل على RENDER_API_KEY من: https://dashboard.render.com/account#api-keys (احفظه وحدّه بالأذونات)
set -euo pipefail

REPO="mouhamed-ui-gif/ghennai-live"
: "${RENDER_API_KEY:?ضع RENDER_API_KEY (من لوحة Render → Account → API Keys)}"
SERVICE_NAME="${SERVICE_NAME:-ghennai}"
REGION="${REGION:-oregon}"

JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | cut -d' ' -f1)"

# مفتاح الذكاء: Gemini أو Groq (أدخِل مفتاحًا واحدًا على الأقل)
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  AI_VARS='{"key":"GEMINI_API_KEY","value":"'"$GEMINI_API_KEY"'","sync":false}'
elif [[ -n "${GROQ_API_KEY:-}" ]]; then
  AI_VARS='{"key":"GROQ_API_KEY","value":"'"$GROQ_API_KEY"'","sync":false}'
else
  echo "! ضع GEMINI_API_KEY (aistudio.google.com/apikey) أو GROQ_API_KEY (console.groq.com)" >&2
  exit 1
fi

payload=$(cat <<JSON
{
  "type": "web",
  "name": "${SERVICE_NAME}",
  "env": "docker",
  "plan": "free",
  "region": "${REGION}",
  "branch": "main",
  "autoDeploy": true,
  "repo": "${REPO}",
  "healthCheckPath": "/",
  "envVars": [
    { "key": "NODE_ENV", "value": "production", "sync": false },
    { "key": "VITE_BASE", "value": "/", "sync": false },
    { "key": "PORT", "value": "3001", "sync": false },
    { "key": "JWT_SECRET", "value": "${JWT_SECRET}", "sync": false },
    ${AI_VARS}
  ],
  "serviceDetails": {
    "env": "docker",
    "dockerContext": ".",
    "dockerfilePath": "./Dockerfile",
    "buildCommand": "",
    "startCommand": "node server/index.js",
    "healthCheckPath": "/"
  }
}
JSON
)

echo "[1/3] إنشاء الخدمة «${SERVICE_NAME}» على Render (free)…"
resp=$(curl -sS -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$payload") || { echo "! فشل الاتصال بـ Render" >&2; exit 1; }

service_id=$(printf '%s' "$resp" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(j.id||'')}catch{process.stdout.write('')}})")
if [[ -z "$service_id" ]]; then
  echo "! لم يُنشأ: خلاصة الاستجابة أدناه (اقرأها جيدًا):" >&2
  printf '%s\n' "$resp" | head -c 1500 >&2; echo >&2
  exit 1
fi
echo "✓ أُنشئت الخدمة: id=${service_id}"

echo "[2/3] انتظار اكتمال التثبيت (يمكن أن يستغرق دقائق)…"
url=""
for i in $(seq 1 60); do
  sleep 10
  st=$(curl -sS "https://api.render.com/v1/services/${service_id}" \
    -H "Authorization: Bearer ${RENDER_API_KEY}")
  url=$(printf '%s' "$st" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write((j.serviceDetails&&j.serviceDetails.url)||'')}catch{process.stdout.write('')}})")
  state=$(printf '%s' "$st" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(j.suspended||'')}catch{}}}")
  if [[ -n "$url" ]]; then echo "✓ الرابط: ${url}"; break; fi
done

echo "[3/3] اختبار الرابط حيًا…"
ok=""
for i in $(seq 1 12); do
  sleep 10
  if curl -sS -o /dev/null -w "%{http_code}" "${url}/" 2>/dev/null | grep -qE '200|301|302'; then
    ok=1; break
  fi
done

echo
echo "=========================================================="
echo " 🎉 منصتك الحية:"
[[ -n "$url" ]] && echo "    ${url}"
[[ "$ok" == "1" ]] && echo "    الحالة: يعمل ✓ (http 200)"
[[ "$ok" != "1" ]] && echo "    الحالة: يتثبّت…  أعد الفتح بعد دقيقة"
echo "----------------------------------------------------------"
echo " الخطوة التالية (Google):"
echo " 1) https://search.google.com/search-console ← أضف ملكية: ${url}"
echo " 2) Sitemaps ← أرسل: ${url}/sitemap.xml"
echo " 3) URL Inspection ← ${url}/ ← Request Indexing"
echo "=========================================================="