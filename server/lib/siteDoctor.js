import fs from 'fs'
import path from 'path'
import { userWorkspace, safeResolve } from './paths.js'

const MARKER_COMMENT = /<!--\s*(?:css|js|meta|favicon|body|html-title|head|title)\s*-->\s*/g

const TAILWIND_RE = new RegExp(
  '\\b(flex|grid|block|hidden|inline-block|container|sticky|absolute|relative|fixed|' +
    'rounded|rounded-[a-zA-Z0-9.\-]+|shadow|shadow-[^"\\s]+|' +
    'p(?:x|y|t|b|l|r)?-[a-zA-Z0-9.\-]+|m(?:x|y|t|b|l|r)?-[a-zA-Z0-9.\-\\/]+|' +
    'w-[a-zA-Z0-9.\\/%-]+|min-w-[a-zA-Z0-9.\-]+|max-w-[a-zA-Z0-9.\-]+|h-[a-zA-Z0-9.\-]+|' +
    'gap-[a-zA-Z0-9.\-]+|grid-cols-[a-zA-Z0-9.\-]+|text-[a-zA-Z0-9.\-]+|bg-[a-zA-Z0-9.\-\/\\[\]]+|' +
    'border-[a-zA-Z0-9.\-]+|font-[a-zA-Z0-9.\-]+|leading-[a-zA-Z0-9.\-]+|tracking-[a-zA-Z0-9.\-]+|' +
    'justify-[a-zA-Z0-9.\-]+|items-[a-zA-Z0-9.\-]+|self-[a-zA-Z0-9.\-]+|content-[a-zA-Z0-9.\-]+|' +
    'space-[xy][a-zA-Z0-9.\-]+|object-[a-zA-Z0-9.\-]+|cursor-[a-zA-Z0-9.\-]+|opacity-[0-9]+|' +
    'transition-[a-zA-Z0-9.\-]+|duration-[0-9]+|ease-[a-zA-Z0-9.\-]+|' +
    'hover:[a-zA-Z0-9:.\-\\[\]()]+|sm:[a-zA-Z0-9:.\-\\[\]()]+|md:[a-zA-Z0-9:.\-\\[\]()]+|lg:[a-zA-Z0-9:.\-\\[\]()]+' +
    ')\\b',
  'g'
)

function localRefs(html) {
  const out = []
  const re = /<(link|script)\b[^>]*?(?:href|src)\s*=\s*["']([^"'#]+)["'][^>]*>/gi
  let m
  while ((m = re.exec(html))) {
    const tag = m[0]
    const type = m[1].toLowerCase()
    const ref = m[2]
    if (ref.startsWith('http') || ref.startsWith('data:') || ref.startsWith('//')) continue
    out.push({ tag, type, ref: ref.split('?')[0] })
  }
  return out
}

function countTailwindClasses(html) {
  const body = (html.match(/class="([^"]+)"/g) || []).join(' ')
  const hits = body.match(TAILWIND_RE) || []
  return new Set(hits).size
}

/**
 * يفحص مساحة العمل ويصلح المواقع (مجلدات تحوي index.html) المولّدة بشكل ناقص:
 * - يزيل التعليقات المتبقية من القوالب (<!-- css --> ..) فوق <!DOCTYPE>
 * - يزيل روابط css/js يشير إلى ملفات غير موجودة (كانت تسبب 404)
 * - إذا كانت الصفحة واجهة Tailwind بدون أي CSS فعلي، يحقن Tailwind CDN تلقائيًا
 * يرجّع قائمة الملفات التي صُلحت.
 */
export function repairSites(root) {
  const projects = []
  const walk = (dir, depth) => {
    if (depth > 2) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'uploads') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (fs.existsSync(path.join(p, 'index.html'))) projects.push(p)
        walk(p, depth + 1)
      }
    }
  }
  walk(root, 0)

  const fixed = []
  let repairedCount = 0

  for (const projectDir of projects) {
    const htmlFile = path.join(projectDir, 'index.html')
    let html
    try {
      html = fs.readFileSync(htmlFile, 'utf8')
    } catch {
      continue
    }
    const fixes = []
    let out = html

    const stripped = out.replace(MARKER_COMMENT, '')
    if (stripped !== out) {
      fixes.push('إزالة تعليقات القوالب المتبقية')
      out = stripped
    }

    const junkBeforeDoctype = /^\s*(?:<\/?(?:script|style|link)\b[^>]*>\s*)+/i
    const noJunk = out.replace(junkBeforeDoctype, '')
    if (noJunk !== out) {
      fixes.push('إزالة وسوم شاردة قبل المستند')
      out = noJunk
    }

    for (const r of localRefs(out)) {
      if (!['.css', '.js'].some((ext) => r.ref.endsWith(ext))) continue
      let candidate
      if (r.ref.startsWith('/')) candidate = path.join(projectDir, r.ref.replace(/^\/+/, ''))
      else candidate = path.join(projectDir, r.ref)
      if (fs.existsSync(candidate)) continue
      const re = new RegExp(`<(link|script)\\b[^>]*?(?:href|src)\\s*=\\s*["']${escapeReg(r.ref.split('?')[0])}["'][^>]*>\\s*(</${r.type}>)?`, 'i')
      const next = out.replace(re, '')
      if (next !== out) {
        fixes.push(`إزالة مرجع ملف غير موجود: ${r.ref}`)
        out = next
      }
    }
    const tailwindCount = countTailwindClasses(out)
    const hasStyleTag = /<style[\s>]/i.test(out)
    const hasCssLink = /<link[^>]*rel=["']?stylesheet/i.test(out)
    const hasTailwindScript = /cdn\.tailwindcss\.com/i.test(out)
    if (tailwindCount >= 4 && !hasStyleTag && !hasCssLink && !hasTailwindScript && /<\/head>/i.test(out)) {
      out = out.replace(
        /<\/head>/i,
        '<script src="https://cdn.tailwindcss.com"></script>\n</head>'
      )
      fixes.push(`حقن Tailwind تلقائيًا (${tailwindCount} صف Tailwind بدون CSS)`)
    }

    if (out !== html) {
      fs.writeFileSync(htmlFile, out, 'utf8')
      repairedCount++
      if (!fixed.some((f) => f.file === htmlFile)) fixed.push({ file: htmlFile, fixes })
      else fixed.find((f) => f.file === htmlFile).fixes = fixes
    }
  }

  return { projects: projects.length, repaired: repairedCount, fixed }
}

export function repairUserSites(email) {
  return repairSites(userWorkspace(email))
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** فحص شامل للموقع قبل اعتبار البناء ناجحًا: الملفات، الوصلات، الصياغة، الأصول */
export function validateSite(root) {
  const checks = []
  const ok = (label, file, valid = true) => checks.push({ ok: !!valid, label, file: file || '' })

  const idx = path.join(root, 'index.html')
  const hasIdx = fs.existsSync(idx)
  ok(hasIdx ? 'index.html موجود' : 'index.html غير موجود', 'index.html', hasIdx)
  if (!hasIdx) return checks

  let html = ''
  try {
    html = fs.readFileSync(idx, 'utf8')
  } catch {
    ok('لا يمكن قراءة index.html', 'index.html', false)
    return checks
  }
  ok('يبدأ بـ <!DOCTYPE html>', 'index.html', /^\s*<!doctype html>/i.test(html))
  ok('يحتوي <html> و <head>', 'index.html', /<html[\s>]/i.test(html) && /<\/head>/i.test(html))
  if (/(لغة|عربية|ar)/i.test(html) && /lang=["'][^"']{2,}["']/.test(html)) {
    ok('سمة اللغة موجودة', 'index.html', true)
  }
  if (html.trim().length < 300) ok('المحتوى ليس ناقصًا (حجم HTML كافٍ)', 'index.html', false)

  const seen = new Set()
  const refs = localRefs(html)
  for (const r of refs) {
    if (seen.has(r.ref)) continue
    seen.add(r.ref)
    const fn = r.ref.startsWith('/') ? path.join(root, r.ref.replace(/^\/+/, '')) : path.join(root, r.ref)
    ok(`المرجع «${r.ref}» يعمل`, r.ref, fs.existsSync(fn))
  }

  // فحص صياغة JS عبر node --check
  const jsFiles = []
  const scanJs = (dir, depth) => {
    if (depth > 3) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.git') || e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) scanJs(p, depth + 1)
      else if (/\.(js|mjs)$/.test(e.name)) jsFiles.push(p)
    }
  }
  scanJs(root, 0)
  for (const f of jsFiles.slice(0, 15)) {
    let size = 0
    try {
      size = fs.statSync(f).size
    } catch {}
    if (size > 400 * 1024) continue
    let syntaxOk = true
    try {
      new Function(fs.readFileSync(f, 'utf8')) // eslint-disable-line no-new-func
    } catch {
      syntaxOk = false
    }
    ok(`صياغة JavaScript سليمة — ${path.relative(root, f)}`, path.relative(root, f), syntaxOk)
  }

  // توازن أقواس CSS + مراجع url()
  const cssFiles = []
  const scanCss = (dir, depth) => {
    if (depth > 3) return
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.git') || e.name === 'node_modules') continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) scanCss(p, depth + 1)
      else if (e.name.endsWith('.css')) cssFiles.push(p)
    }
  }
  scanCss(root, 0)
  for (const f of cssFiles.slice(0, 10)) {
    let css = ''
    try {
      css = fs.readFileSync(f, 'utf8')
    } catch {
      continue
    }
    const open = (css.match(/\{/g) || []).length
    const close = (css.match(/\}/g) || []).length
    ok(`أقواس CSS متوازنة (${path.relative(root, f)})`, path.relative(root, f), open === close)
  }

  // وجود أي أصول مُشار إليها من HTML وCSS وصور داخلية
  const urls = html.match(/url\(\s*["']?([^"')]+)["']?\s*\)/g) || []
  for (const u of urls) {
    const ref = u.replace(/url\(\s*["']?/, '').replace(/["']?\s*\)$/, '').split('?')[0].replace(/^\.?\//, '')
    if (!ref || ref.startsWith('http') || ref.startsWith('data:') || ref.startsWith('#')) continue
    ok(`الأصل «${ref}» موجود`, ref, fs.existsSync(path.join(root, ref)))
  }

  return checks
}

export function validateUserSite(email, rootRel) {
  const ws = userWorkspace(email)
  const root = rootRel ? safeResolve(ws, rootRel) : ws
  return validateSite(root)
}