#!/usr/bin/env bash
# النشر الكامل إلى GitHub Pages (بعد أي تعديل في الكود أو المحتوى)
# الاستخدام: ./deploy.sh          ← بناء كامل + نشر
#            ./deploy.sh content  ← محتوى فقط (تعديل يومي سريع بلا إعادة بناء)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PAGES="${PAGES_DIR:-/tmp/ghennai-repo}"
DATE="$(date +%F)"

# حدّث sitemap بـ lastmod اليوم
sed -i "s|<lastmod>[0-9-]*</lastmod>|<lastmod>${DATE}</lastmod>|" "$ROOT/public/sitemap.xml"

if [[ "${1:-}" != "content" ]]; then
  (cd "$ROOT" && npm run build)
fi

cd "$ROOT"
if [[ "${1:-}" == "content" ]]; then
  for f in editable.json sitemap.xml robots.txt og-cover.png og-cover.svg; do
    cp -f "public/$f" "$PAGES/$f"
  done
else
  rsync -a --delete --exclude .git dist/ "$PAGES/"
fi

cd "$PAGES"
git add -A
git -c user.email="mouh@local" -c user.name="mouh" commit -m "update ${DATE}" --quiet || true
git push origin main
git log --oneline -1

# إشعار Google بأن المحتوى تغيّر (إعادة الفهرسة أسرع)
curl -sS "https://www.google.com/ping?sitemap=https%3A%2F%2Fghennai.onrender.com%2Fsitemap.xml" >/dev/null 2>&1 || true
curl -sS "https://www.google.com/ping?sitemap=https%3A%2F%2Fmouhamed-ui-gif.github.io%2Fghennai-app%2Fsitemap.xml" >/dev/null 2>&1 || true