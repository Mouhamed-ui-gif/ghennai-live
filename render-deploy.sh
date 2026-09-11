#!/usr/bin/env bash
# ===== Ghennai — النشر التلقائي على Render (استضافة مجانية) =====
# الاستخدام:
#   RENDER_API_KEY=rnd_xxx GEMINI_API_KEY=AIza... ./render-deploy.sh
#   RENDER_API_KEY=rnd_xxx GROQ_API_KEY=gsk_... ./render-deploy.sh
# احصل على RENDER_API_KEY من: https://dashboard.render.com/account#api-keys
set -euo pipefail

REPO="https://github.com/mouhamed-ui-gif/ghennai-live"
BRANCH="main"
: "${RENDER_API_KEY:?ضع RENDER_API_KEY (لوحة Render ← Account ← API Keys)}"
SERVICE_NAME="${SERVICE_NAME:-ghennai}"
REGION="${REGION:-oregon}"

JWT_SECRET="$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | cut -d' ' -f1)"

if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  AI_VARS='{ "key": "GEMINI_API_KEY", "value": "'"$GEMINI_API_KEY"'", "sync": false }'
elif [[ -n "${GROQ_API_KEY:-}" ]]; then
  AI_VARS='{ "key": "GROQ_API_KEY", "value": "'"$GROQ_API_KEY"'", "sync": false }'
else
  echo "! ضع GEMINI_API_KEY (aistudio.google.com/apikey) أو GROQ_API_KEY (console.groq.com)" >&2
  exit 1
fi

echo "[0] جلب مساحة العمل (workspace)…"
OWNER_ID="${OWNER_ID:-}"
if [[ -z "$OWNER_ID" ]]; then
  owners=$(curl -sS https://api.render.com/v1/owners -H "Authorization: Bearer ${RENDER_API_KEY}")
  OWNER_ID=$(printf '%s' "$owners" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write((j[0]&&j[0].id)||'')}catch{process.stdout.write('')}})")
fi
if [[ -z "$OWNER_ID" ]]; then
  echo "! تعذّر جلب workspace id — افتح Render ← Settings وانسخ Workspace ID في OWNER_ID=" >&2
  exit 1
fi
echo "✓ workspace: ${OWNER_ID}"

payload=$(cat <<JSON
{
  "type": "web_service",
  "name": "${SERVICE_NAME}",
  "ownerId": "${OWNER_ID}",
  "repo": "${REPO}",
  "branch": "${BRANCH}",
  "autoDeploy": "yes",
  "envVars": [
    { "key": "NODE_ENV", "value": "production", "sync": false },
    { "key": "VITE_BASE", "value": "/", "sync": false },
    { "key": "PORT", "value": "3001", "sync": false },
    { "key": "JWT_SECRET", "value": "${JWT_SECRET}", "sync": false },
    ${AI_VARS}
  ],
  "serviceDetails": {
    "runtime": "docker",
    "envSpecificDetails": {
      "dockerCommand": "",
      "dockerContext": ".",
      "dockerfilePath": "./Dockerfile"
    },
    "healthCheckPath": "/",
    "plan": "free",
    "region": "${REGION}"
  }
}
JSON
)

echo "[1/3] إنشاء خدمة الويب «${SERVICE_NAME}» (free)…"
resp=$(curl -sS -X POST https://api.render.com/v1/services \
  -H "Authorization: Bearer ${RENDER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$payload") || { echo "! فشل الاتصال بـ Render" >&2; exit 1; }

service_id=$(printf '%s' "$resp" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write((j.service&&j.service.id)||'')}catch{process.stdout.write('')}})")
if [[ -z "$service_id" ]]; then
  echo "! لم يُنشأ. تفاصيل الاستجابة:" >&2
  printf '%s\n' "$resp" | head -c 1500 >&2; echo >&2
  exit 1
fi
echo "✓ أُنشئت الخدمة (id=${service_id}) — يبدأ البناء الآن…"

echo "[2/3] انتظار جاهزية الرابط (قد يستغرق عدة دقائق)…"
url=""
for i in $(seq 1 90); do
  sleep 10
  st=$(curl -sS "https://api.render.com/v1/services/${service_id}" \
    -H "Authorization: Bearer ${RENDER_API_KEY}")
  url=$(printf '%s' "$st" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write((j.serviceDetails&&j.serviceDetails.url)||'')}catch{process.stdout.write('')}})")
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
[[ "$ok" == "1" ]] && echo "    الحالة: يعمل ✓"
[[ "$ok" != "1" ]] && echo "    الحالة: يتثبّت… أعد الفتح بعد دقيقة"
echo "----------------------------------------------------------"
echo " للوصول من أي جهاز: سجّل الدخول الآن وابنِ ونفّذ وانشر."
echo " Google (بعد التفعيل):"
echo " 1) search.google.com/search-console ← أضف ملكية: ${url}"
echo " 2) Sitemaps ← أرسل ${url}/sitemap.xml"
echo " 3) URL Inspection ← Request Indexing"
echo "=========================================================="