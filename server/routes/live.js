import express from 'express'
import fs from 'fs'
import path from 'path'
import { userWorkspace, safeResolve } from '../lib/paths.js'
import { shareRoot, shareCodeValid } from '../lib/share.js'

const router = express.Router()

const PUBLIC_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
}

// مجلدات/ملفات لا تُقدَّم عبر الرابط العلني أبدًا
// حقنة اختيار العناصر: تُقدَّم فقط عند طلب صريح (?pick=1) من داخل التطبيق
const EDIT_PROBE = `<script>
(function () {
  var editing = false
  function info(el) {
    var cn = (typeof el.className === 'string' && el.className) || el.getAttribute('class') || ''
    var attrs = el.attributes || { getNamedItem: function () { return null } }
    return {
      tag: (el.tagName || '').toLowerCase(),
      id: el.id || '',
      className: cn,
      text: ((el.textContent || '').replace(/\\s+/g, ' ')).trim().slice(0, 120),
      href: attrs.getNamedItem('href') ? attrs.getNamedItem('href').value : null,
      src: attrs.getNamedItem('src') ? attrs.getNamedItem('src').value : null
    }
  }
  function clearRing() { var r = document.getElementById('__ghn_ring__'); if (r) r.remove() }
  function ring(el) {
    clearRing()
    if (!el) return
    var r = document.createElement('div')
    r.id = '__ghn_ring__'
    r.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483646;background:rgba(34,211,238,.16);outline:2px solid #22d3ee;outline-offset:1px;border-radius:4px'
    var b = el.getBoundingClientRect()
    r.style.left = b.left + 'px'; r.style.top = b.top + 'px'; r.style.width = b.width + 'px'; r.style.height = b.height + 'px'
    document.body.appendChild(r)
  }
  function pickable(ev) {
    var t = ev.target
    return t.closest ? t.closest('a,button,h1,h2,h3,h4,h5,h6,p,span,li,div,img,figure,section,nav,header,footer,table') : t
  }
  window.addEventListener('message', function (e) {
    if (e.data && e.data.source === 'ghn-preview' && e.data.type === 'edit-mode') { editing = !!e.data.on; if (!editing) clearRing() }
  })
  document.addEventListener('mouseover', function (ev) { if (editing) ring(pickable(ev)) }, true)
  document.addEventListener('mouseout', function () { if (editing) clearRing() }, true)
  document.addEventListener('click', function (ev) {
    if (!editing) return
    ev.preventDefault(); ev.stopPropagation()
    var el = pickable(ev) || ev.target
    parent.postMessage({ source: 'ghn-preview', type: 'pick', el: info(el) }, '*')
  }, true)
})();
</script>`

const DENY_NAMES = new Set(['.git', '.ghennai', '_ghennai', 'node_modules', 'uploads', 'light-assets', 'assets_old', '.env', '.env.example', 'config.json', 'package.json', 'package-lock.json', 'README.md', '.gitignore'])

function contentType(file) {
  return PUBLIC_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

function isDeniedName(name) {
  return name.startsWith('.') && name !== '.htaccess' ? true : DENY_NAMES.has(name)
}

/** يحل مسارًا آمنًا داخل قاعدة الموقع، ويمنع عناصر النظام */
function resolveIn(base, rest) {
  let rel = String(rest || '').replace(/^\/+/, '')
  if (!rel) rel = 'index.html'
  if (rel.split('/').some((seg) => !seg || seg === '.' || seg === '..' || isDeniedName(seg))) return null
  let abs
  try {
    abs = safeResolve(base, rel)
  } catch {
    return null
  }
  if (!fs.existsSync(abs)) return null
  let st
  try {
    st = fs.statSync(abs)
  } catch {
    return null
  }
  if (st.isDirectory()) {
    const idx = path.join(abs, 'index.html')
    if (!fs.existsSync(idx)) return null
    return { file: idx, dir: abs }
  }
  if (!st.isFile()) return null
  return { file: abs, dir: path.dirname(abs) }
}

router.use('/', (req, res, _next) => {
  const parts = req.path.split('/').filter(Boolean)
  const code = parts[0] || ''
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).type('text/plain').send('Method Not Allowed')
  if (!shareCodeValid(code)) return res.status(404).type('text/plain').send('الموقع غير موجود')

  const entry = shareRoot(code)
  if (!entry) return res.status(404).type('text/plain').send('الموقع غير موجود')

  const ws = userWorkspace(entry.email)
  let base = ws
  if (entry.root) {
    const abs = safeResolve(ws, entry.root)
    if (!fs.existsSync(abs)) return res.status(404).type('text/plain').send('الموقع غير موجود')
    base = abs
  }
  const indexP = path.join(base, 'index.html')
  if (!fs.existsSync(indexP)) {
    return res.status(404).type('text/plain').send('الموقع قيد الإنشاء — عد لاحقًا قليلًا…')
  }

  const rest = parts.slice(1).join('/')
  // دون مقطع ملف: نوجّه للجذر مع / حتى تعمل الروابط النسبية
  if (parts.length === 1 && !/\/$/.test(req.path)) return res.redirect(`/live/${code}/`)
  const hit = resolveIn(base, rest)
  if (!hit) return res.status(404).type('text/plain').send('الملف غير موجود')

  res.setHeader('Content-Type', contentType(hit.file))
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Ghennai', code)
  if (/\.(html?)$/i.test(hit.file) && req.query.pick === '1') {
    try {
      const html = fs.readFileSync(hit.file, 'utf8')
      const inject = html.replace(/<\/body>/i, (m) => EDIT_PROBE + '\n' + m)
      return res.send(inject === html ? html + EDIT_PROBE : inject)
    } catch {
      return res.status(500).type('text/plain').send('تعذّر عرض الصفحة')
    }
  }
  if (rest && !/\/$/.test(req.path) && fs.existsSync(path.join(hit.file))) {
    try {
      const st = fs.statSync(hit.file)
      res.setHeader('Content-Length', String(st.size))
    } catch {}
  }
  return res.sendFile(hit.file)
})

export default router