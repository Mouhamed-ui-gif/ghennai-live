import path from 'path'
import fs from 'fs'
import tools from '../tools/registry.js'
import { generate, codestreamGen } from '../lib/modelRouter.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'
import { userWorkspace } from '../lib/paths.js'
import { safeResolve } from '../lib/paths.js'
import { contextBlock, rememberProject } from '../lib/memory.js'
import { seedTemplates } from '../lib/templateKit.js'
import { repairUserSites, validateUserSite } from '../lib/siteDoctor.js'
import { ensureProject, setProjectMeta, snapshotProject, listVersions, guessProjectRoot, siteRootFor } from '../lib/projects.js'
import { ensureShare, publicUrl } from '../lib/share.js'
import { gateTool } from '../lib/approvalGate.js'
import { gitRepoInfo } from '../lib/approvalGate.js'
import * as procs from '../lib/processes.js'
import searchTools from '../tools/search.js'

const MAX_ITERATIONS = 10
const MAX_TYPED_CHARS = 30000
const MAX_FIX_ROUNDS = 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function emitProjectState(email, project, versions = listVersions(email, project?.root || '')) {
  emitUser(email, { type: 'project_state', project: { ...project, versions } })
}

function detectProjectName(msg) {
  const m = String(msg || '').match(/["'“”«»]([^"'“”«»]{2,40})["'“”«»]/)
  return m ? m[1] : 'الموقع الجديد'
}

/** بث النص على شكل أحرف تُكتب حيّاً أمام المستخدم (code_token) */
async function* yieldTyped(text, opts = {}) {
  const s = String(text ?? '').slice(0, MAX_TYPED_CHARS)
  const chunk = opts.chunk || 60
  const rate = opts.rate || 8
  for (let i = 0; i < s.length; i += chunk) {
    yield { type: 'code_token', content: s.slice(i, i + chunk), file: opts.file || null }
    await sleep(rate)
  }
}

/** تحقق نهائي صادق قبل إعلان النجاح: الملف موجود؟ بحجم معقول؟ غير مقطوع؟ */
function verifySiteBuilt(email, root) {
  const ws = userWorkspace(email)
  const base = String(root || '.').replace(/\/+$/, '')
  const dir = base && base !== '.' ? path.resolve(ws, base) : ws
  const idxFile = ['index.html', 'index.htm'].map((n) => path.join(dir, n)).find((f) => fs.existsSync(f))
  if (!idxFile) return { ok: false, reason: 'لا يوجد index.html في مجلد المشروع — لم يُبنَ شيء فعليًا' }
  let size = 0
  try { size = fs.statSync(idxFile).size } catch { /* noop */ }
  if (size < 1500) return { ok: false, reason: `ملف index.html حجمه ${size} بايت فقط — البناء غير مكتمل، لن أدّعي النجاح` }
  let html = ''
  try { html = fs.readFileSync(idxFile, 'utf8') } catch { /* noop */ }
  if ((/<!DOCTYPE/i.test(html) || /<html/i.test(html)) && !/<\/html>/i.test(html)) {
    return { ok: false, reason: 'الصفحة مقطوعة (تفتقد </html>) — البناء غير مكتمل' }
  }
  // سلامة المراجع: كل src/href محلي يجب أن يشير لملف كتبناه فعلًا (لا روابط ميتة)
  const missing = []
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi)) {
    const ref = (m[1] || '').trim()
    if (!ref || /^(https?:|data:|mailto:|tel:|#)/i.test(ref)) continue
    if (!fs.existsSync(path.join(dir, ref))) missing.push(ref)
  }
  if (missing.length) {
    return { ok: false, reason: `مراجع مفقودة في الصفحة (ستظهر 404): ${missing.slice(0, 5).join('، ')} — أنشئها أو أزل الإشارة إليها` }
  }
  return { ok: true, size }
}

/** فحص جودة التصميم (مظاهر "الشكل العام/العادية") — يُرجع قائمة تحسينات ملموسة */
function designQualityCheck(email, root) {
  const ws = userWorkspace(email)
  const base = String(root || '.').replace(/\/+$/, '')
  const dir = base && base !== '.' ? path.resolve(ws, base) : ws
  const idxFile = ['index.html', 'index.htm'].find((n) => fs.existsSync(path.join(dir, n)))
  const cssFile = ['style.css', 'main.css', 'styles.css', 'app.css'].find((n) => fs.existsSync(path.join(dir, n)))
  if (!idxFile) return []

  const flags = []
  let html = ''
  let css = ''
  try { html = fs.readFileSync(path.join(dir, idxFile), 'utf8') } catch { /* noop */ }
  if (cssFile) {
    try { css = fs.readFileSync(path.join(dir, cssFile), 'utf8') } catch { /* noop */ }
  } else {
    const inline = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || []).map((m) => m.replace(/<\/?style[^>]*>/gi, '')).join('\n')
    if (inline) css = inline
  }

  if (html.length < 2800) flags.push({ label: 'الصفحة مختصرة جدًا — تُشعر بأنها هيكل جاهز؛ أضف محتوى حقيقيًا مفصلًا وسطورًا بارزة', code: 'thin' })
  if (css.length < 900) flags.push({ label: 'الأنماط ضعيفة — عمّق بالمساحات والتدرجات والظلال', code: 'weak-css' })
  if (!/(@keyframes|animation\s*:|transition\s*:|hover\b)/i.test(css)) flags.push({ label: 'لا وجود لأي حركة — أضف ظهورًا متدرجًا (reveal) و hover وأنيميشن ناعم', code: 'motion' })
  if (!/(linear-gradient|radial-gradient|conic-gradient)/i.test(css)) flags.push({ label: 'لا تدرجات — أضف توهجات خلفية وشعارًا متدرجًا وأعمدة ملونة', code: 'gradient' })
  if (!/backdrop-filter/.test(css)) flags.push({ label: 'لا بطاقات زجاجية — أضف glass cards بشفافية وضبابية خلفية', code: 'glass' })
  if (!/@media\s/i.test(css)) flags.push({ label: 'لا توجد استعلامات وسائط — تأكد من استجابة الموبايل', code: 'media' })
  if (!/(Cairo|Tajawal|Inter|IBM Plex Sans Arabic|Rubik|Almarai|space-grotesk|Poppins|Outfit)/i.test(html + css)) flags.push({ label: 'خطوط النظام فقط — اعتمد خطوطًا عربية احترافية من Google Fonts', code: 'font' })
  if (!/(favicon|rel="icon"|\.svg)/i.test(html)) flags.push({ label: 'لا أيقونة — أضف SVG favicon عبر data URI', code: 'favicon' })
  if (!/(images\.unsplash\.com|picsum\.photos|i\.pravatar\.cc|<img[\s>])/i.test(html)) flags.push({ label: 'لا صور حقيقية — أضف صور Unsplash موضوعية لكل قسم رئيسي مع fallback متدرج', code: 'photos' })
  if (!/(perspective|preserve-3d|translateZ|rotateX|rotateY|data-speed|parallax|tilt)/i.test(html + css)) flags.push({ label: 'لا عمق ثلاثي الأبعاد — أضف tilt تفاعلي/parallax/أشكالًا عائمة', code: 'depth' })
  if (!/(preloader|loader|window[^;]{0,40}load)/i.test(html)) flags.push({ label: 'لا شاشة تحميل — أضف preloader بنسبة مئوية يتلاشى عند اكتمال التحميل', code: 'loader' })
  if (!/(marquee|counter|slider|accordion|testimonial)/i.test(html)) flags.push({ label: 'ينقصه عناصر حية — أضف marquee وعدادات متحركة وسلايدر آراء وأكورديون', code: 'lively' })
  return flags
}

const EDIT_SYSTEM_PROMPT = (element, userMessage) => `You are GHENNAI's Coding Agent in EDIT MODE — a precise surgeon for the user's live website. The user clicked an element in their preview and asked for a targeted change.

ELEMENT CLICKED (inspect it in the source files):
${JSON.stringify(element || {})}

USER'S REQUESTED CHANGE:
${userMessage}

INSTRUCTIONS:
1. Read the relevant source file(s) (index.html / style.css / app.js in the workspace root) to find the exact code that renders this element. Match by tag name, id, class, or the element's visible text/content.
2. Make ONLY the requested change using the replaceInFile tool with the exact current text you found via readFile. Never rewrite whole files, never restructure the site. Keep edits minimal and surgical.
3. Verify with readFile that the change landed correctly.
4. Reply with a one-line Arabic confirmation: what changed and where (file + element).
If the change is not feasible, say exactly why and suggest the closest alternative.`

const PROPOSE_PROMPT = (element, userMessage) => `You are GHENNAI's Coding Agent in PROPOSAL MODE — you plan a change but NEVER apply it. The user requested an edit and must approve it before anything is modified (safety rule).

ELEMENT CLICKED (inspect it in the source files, may be null for text requests):
${JSON.stringify(element || {})}

USER'S REQUESTED EDIT:
${userMessage}

INSTRUCTIONS:
1. Read the relevant source file(s) only to LOCATE the exact code that renders the element / holds the text to change (match by id, class, tag, or visible text).
2. Do NOT call writeFile, replaceInFile, runTerminal, or deleteFile — reading (readFile / listDir) is allowed. Never modify anything.
3. Reply with a SHORT numbered plan in the user's language (~80-120 words):
   1) أين سأعدّل — اسم الملف + العنصر/السطر الذي وجدتُه (مع القليل من السياق الحالي).
   2) ماذا سأغيّر بالضبط (قبل ← بعد).
   3) تأكيد أنني لن أمسّ أي جزء آخر من الموقع.
End with the line: «هل أوافق على هذا التعديل؟» so the user can approve.`

const SYSTEM_PROMPT = `You are GHENNAI's autonomous Coding Agent — a senior full-stack engineer. You build PROFESSIONAL, production-grade websites inside the user's workspace by ACTUALLY using tools (never pretend):
- filesystem: writeFile, readFile, appendFile, deleteFile, listDir, mkDir. Use RELATIVE paths from the workspace root.
- terminal: shell commands (bash) INSIDE the workspace: scaffold, npm install, run, test, "ls -R ." to list. Set "cwd" to the relative folder (default ".").

TEMPLATES (premium, in "_ghennai/templates"): "modern-saas", "portfolio", "restaurant", "agency", "store" — each with index.html + style.css + app.js. For a SINGLE simple page (no navigation/multi-page requirement): write ONE index.html with ALL CSS in <style> and ALL JS in <script> directly — DO NOT copy templates, DO NOT readFile templates. Only copy a template folder when the request implies multi-page or advanced SPA-like layout. NEVER write files via echo, printf, heredoc, base64, or terminal — only writeFile/replaceInFile.

DESIGN — EPIC MODE (mandatory for every site, whatever the type):
1. Real photography everywhere: every major section gets a REAL photo via images.unsplash.com (theme-relevant photo IDs you know, with ?q=80&w=1600&auto=format&fit=crop), hero eager + rest loading="lazy", each wrapped with onerror fallback AND a rich gradient underneath so the site stays gorgeous offline. Avatars via Unsplash faces or https://i.pravatar.cc/150?img=N. Never leave a bare section: photo, gradient mesh, SVG pattern, or glass panel — always layered.
2. Layered cinematic backgrounds: base (photo or deep gradient) + dark overlay gradient + animated aurora blobs (@keyframes drift, blur(80px)) + subtle grid/noise (inline SVG feTurbulence data-URI at low opacity). Different backdrop mood per section, same palette family.
3. 3D & depth: perspective tilt-on-mousemove for hero visual + cards (vanilla JS, max ~10deg, reset on leave), parallax layers (data-speed on scroll), floating 3D shapes (transform-style:preserve-3d, rotateX/Y animation), flip card or 3D carousel where it fits, sticky glass navbar with blur. Everything casts soft layered shadows.
4. Motion everywhere (buttery, GPU-friendly transforms/opacity only): branded preloader overlay with % progress that fades on window load; IntersectionObserver reveal with stagger delays; animated counters; infinite marquee strip; magnetic buttons (scale+glow on hover); hover lift+glow on EVERY card/link; FAQ accordion; auto-rotating testimonials slider; back-to-top; custom scrollbar; smooth anchor scrolling; section enter transitions. Add prefers-reduced-motion guard.
5. Complete premium structure: sticky glass navbar (logo + links + CTA), hero (badge chip + gradient display headline + subtext + dual CTA + trust row with avatars), logos/marquee strip, features grid (4-6 icon cards with photos or gradient icons), showcase/gallery with real photos, how-it-works, stats strip (animated counters), testimonials slider, pricing or portfolio grid, FAQ accordion, final CTA band over a photo backdrop, rich footer columns. Plus ONE unforgettable signature touch (diagonal dividers, glowing gradient-border cards, rotating badge, custom cursor glow…).
6. Typography & palette: Google-Fonts display + body (Tajawal/Cairo/Almarai for ar, Inter/Outfit/Space Grotesk for en), clamp() fluid scale. Derive exactly 2-3 brand colors from the request/style (never default purple-blue soup, never rainbow); AAA-ish contrast for body text; dark cinematic base unless user asked light.
7. MULTI-PAGE (if implied): separate real .html files per page each complete with shared style.css + app.js and working relative links — never <section> stubs.
7. Meta description, viewport, inline SVG favicon, short comment header on each file.

RULES:
0. BRIEF FIRST (clarify once, then build): if the request is vague (fewer than 2 concrete details: no name, no style/colors, no sections, no audience) AND the conversation shows you have NOT asked yet, do NOT build — reply with at most 3 short questions (each with 2-4 suggested options: style/mood, colors, key sections or content), ending with "أجب باختصار وسأبني فورًا 🚀". Ask ONCE only: if memory/context shows questions were already asked, or the user answered anything, BUILD immediately with best guesses — never ask twice, never stall.
1. Actually DO it with tools; verify what you claim (readFile / ls -R) before the final answer.
   PATH CONTRACT (strict): every path is relative to the workspace ROOT and ALWAYS includes the project folder (e.g. "sites/my-shop/index.html"). Never cd anywhere (each command runs in a fresh shell from the workspace root); pass cwd explicitly instead. Never invent absolute /home/... paths — always relative.
2. Write complete real files, never placeholders or "/* ... */" stubs. Static sites: write files directly — no npm/vite unless user asked for a React/app project.
3. INTEGRITY: read back your index.html; every href/src must point to a file you actually wrote. Never Tailwind classes without a real stylesheet — copy a full template together, or INLINE all CSS in <style> and JS in <script> in one file. Generated HTML starts with <!DOCTYPE html>.
4. JS SAFETY: guard every element (const el = x; if (el) {...}); wrap wiring in DOMContentLoaded; every id/class referenced must exist in the HTML; page must load with zero JS errors.
5. On command failure: read stderr, fix, retry. Never destructive/outside-workspace commands.
6. SPEED: finish sites in as few model turns as possible: turn 1 = write ALL files in ONE batch of parallel writeFile/replaceInFile (no directory listing needed for a simple single-page site); turn 2 = verify (read back, ls -R) + final summary; turn 3 optional for multi-page. Never re-list existing directories, never readTemplate whole files, never exceed 4 turns. Abort/finish if no files changed after 2 turns.
7. EPIC DENSITY: single-page sites live in ONE index.html (~220-380 lines of dense premium work — photos, layered backgrounds, 3D, motion, full sections). Never bare, never bloated with off-topic sections: every block earns its place. Short ≠ empty: even a compact page must feel cinematic.
8. Finish with a clear Arabic summary: what was built, how to open it, file tree.
9. POLISH PASS before finishing: re-verify links/tags/RTL/mobile; ensure hero glow, hover effects, coherent brand palette, at least one micro-interaction and one signature creative touch, favicon + meta description + a real Google-Fonts Arabic font; remove console.logs/TODO comments. Never ship a default/generic look — if the page feels like a starter template, elevate it before declaring success.

CREATOR INFO: You are part of GHENNAI — created by **محمد غناي (Mohamed Ghennay)**, its sole developer. If asked "من صنعك؟": answer proudly "صنعني محمد غناي".

FIRST-CLASS TOOLS (prefer these over raw runTerminal — they verify, gate approvals, and report honestly):
- searchFiles: ALWAYS search before editing existing code ("which button?" → searchFiles first, then readFile, then replaceInFile).
- gitStatus / gitDiff: inspect changes (auto-approved, read-only). They REFUSE folders without their own direct .git — if refused, use gitInit first. Show the user +N/-M and file lists from REAL output.
- gitInit: create a repo here. gitCommit: stage + commit (asks user approval first — the approval card shows your message AND the affected repo).
- installDeps / buildProject / runTests: npm lifecycle with pre-verification (missing package.json/script → honest error, never fake success). buildProject streams real compiler output.
- startPreview: real live preview (static → instant share link; npm → install + dev server + proxied URL). If it fails you get real logs — read them with previewLogs, fix, retry.
- stopPreview / previewLogs: manage preview processes.
- deleteFile / createDir: delete needs approval; creates are direct.
After npm/build/test/preview operations, ALWAYS report the real exit code and output tail to the user — never summarize as success unless ok:true.`

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Create or overwrite a file inside the workspace with the given content. Creates parent folders automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace root, e.g. my-site/index.html' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read a file inside the workspace and return its content.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative path from workspace root' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listDir',
      description: 'List files and folders inside a directory of the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative directory path, default "."' } },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runTerminal',
      description: 'Run a shell command inside the workspace. Returns stdout and stderr. Use "ls -R ." to list everything.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          cwd: { type: 'string', description: 'Relative folder to run in, default "."' },
        },
        required: ['command'],
      },
    },
  },
{
    type: 'function',
    function: {
      name: 'replaceInFile',
      description:
        "Replace a specific text snippet inside an existing file with a new text — for precise surgical edits (e.g. change one element's color/text on the live site). Returns how many occurrences were replaced.",
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace root' },
          old: { type: 'string', description: 'Exact existing text to replace (must match the file content exactly)' },
          new: { type: 'string', description: 'New text to put in its place' },
          replaceAll: { type: 'boolean', description: 'Replace every occurrence (default false = first occurrence only)' },
        },
        required: ['path', 'old', 'new'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteFile',
      description: 'Delete a file inside the workspace (irreversible — needs user approval).',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative path from workspace root' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createDir',
      description: 'Create a folder (and parents) inside the workspace.',
      parameters: { type: 'object', properties: { path: { type: 'string', description: 'Relative directory path' } }, required: ['path'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchFiles',
      description: 'Search file contents inside the workspace for a keyword. Returns paths + line numbers. Use before editing ("which button?" → search first).',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Keyword to search for' }, dir: { type: 'string', description: 'Subfolder to search in (default ".")' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitStatus',
      description: 'Real git status of the project folder (branch + short status). Read-only, runs instantly. Refuses folders without their own .git (never reports a parent repo).',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Relative folder, default "."' } }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitInit',
      description: 'Initialize a git repo in a folder (needs user approval).',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Relative folder to initialize' } }, required: ['cwd'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitDiff',
      description: 'Real git diff summary (+ truncated full diff) of the project folder. Read-only.',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Relative folder, default "."' }, path: { type: 'string', description: 'Single file to diff (optional)' } }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitCommit',
      description: 'Stage everything and commit with a message (needs user approval). Fails honestly if not a git repo.',
      parameters: { type: 'object', properties: { message: { type: 'string', description: 'Commit message' }, cwd: { type: 'string', description: 'Relative folder, default "."' } }, required: ['message'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'installDeps',
      description: 'Run npm install in a project folder (needs user approval). Verifies package.json exists first.',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Relative project folder' } }, required: ['cwd'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buildProject',
      description: 'Run npm run build in a project folder (needs user approval). Verifies the build script exists first; returns real output + exit code.',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Relative project folder' } }, required: ['cwd'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runTests',
      description: 'Run the project test suite (needs user approval). Verifies a test script exists first.',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Relative project folder' } }, required: ['cwd'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'startPreview',
      description: 'Start a REAL live preview: static sites get an instant share link; npm projects get install (if needed) + a real dev server with a proxied URL. Verifies HTTP readiness — fails honestly with logs if the server never responds.',
      parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'Relative project folder' }, port: { type: 'number', description: 'Preferred port (optional)' } }, required: ['cwd'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'stopPreview',
      description: 'Stop a running preview process by id.',
      parameters: { type: 'object', properties: { id: { type: 'string', description: 'Preview id from startPreview' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'previewLogs',
      description: 'Read the buffered logs of a preview process (for error diagnosis).',
      parameters: { type: 'object', properties: { id: { type: 'string', description: 'Preview id' }, tail: { type: 'number', description: 'Last N lines (default 100)' } }, required: ['id'] },
    },
  },
]

function toolSchemaMap() {  return {
    writeFile: 'filesystem', readFile: 'filesystem', listDir: 'filesystem',
    replaceInFile: 'filesystem', deleteFile: 'filesystem', createDir: 'filesystem',
    runTerminal: 'terminal',
    gitStatus: 'terminal', gitDiff: 'terminal', gitCommit: 'terminal', gitInit: 'terminal',
    installDeps: 'terminal', buildProject: 'terminal', runTests: 'terminal',
    searchFiles: 'search',
    startPreview: 'proc', stopPreview: 'proc', previewLogs: 'proc',
  }
}

/** أوامر حقيقية مبنية من أدوات عالية المستوى (git/npm) — تُنفذ عبر terminal الآمن */
function agentCommandFor(name, args = {}) {
  const cwd = args.cwd || '.'
  switch (name) {
    case 'gitInit':
      return { command: 'git init', cwd, timeoutMs: 30000 }
    case 'gitStatus':
      return { command: 'git status --short', cwd, timeoutMs: 30000 }
    case 'gitDiff': {
      const p = typeof args.path === 'string' && args.path && !args.path.includes('..') ? ` -- ${args.path}` : ''
      return { command: `git diff --stat${p} && git diff${p} | head -c 4000`, cwd, timeoutMs: 30000 }
    }
    case 'gitCommit': {
      const msg = String(args.message || '').replace(/["`$\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
      if (!msg) return { error: 'رسالة الـcommit فارغة' }
      return { command: `git rev-parse --is-inside-work-tree && git add -A && git commit -m "${msg}"`, cwd, timeoutMs: 60000, commitMsg: msg }
    }
    case 'installDeps':
      return { command: 'npm install', cwd, timeoutMs: 300000, needPkg: true }
    case 'buildProject':
      return { command: 'npm run build', cwd, timeoutMs: 300000, needPkg: true, needScript: 'build', state: 'BUILDING' }
    case 'runTests':
      return { command: 'CI=true npm test', cwd, timeoutMs: 180000, needPkg: true, needScript: 'test', state: 'TESTING' }
    default:
      return null
  }
}

/** حارس المستودع المباشر: ارفض git في مجلد بلا .git مباشر (يمنع الصعود للأب) */
function assertDirectRepo(ws, cwd) {
  let dir
  try {
    dir = safeResolve(ws, String(cwd || '.'))
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
  if (fs.existsSync(path.join(dir, '.git'))) return { ok: true, dir }
  let parent = null
  try {
    const { gitRepoInfo } = { gitRepoInfo: null }
    void gitRepoInfo
  } catch { /* noop */ }
  try {
    const { execFileSync } = require('node:child_process')
    void execFileSync
  } catch { /* noop */ }
  return { ok: false, error: `ليس مستودع git مباشر: ${cwd || '.'} — استخدم gitInit أولًا إن أردت مستودعًا هنا`, dir }
}
function checkPkgScript(ws, cwd, needScript = null) {
  let dir
  try {
    dir = safeResolve(ws, String(cwd || '.'))
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
  const pkgFile = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgFile)) {
    return { ok: false, error: `لا يوجد package.json في ${cwd || '.'} — هذا ليس مشروع npm` }
  }
  if (needScript) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
      if (!pkg.scripts || !pkg.scripts[needScript]) {
        const avail = pkg.scripts ? Object.keys(pkg.scripts).join(', ') : 'لا سكربتات'
        return { ok: false, error: `لا يوجد سكربت "${needScript}" (المتاح: ${avail})` }
      }
    } catch {
      return { ok: false, error: 'package.json تالف — تعذّر قراءته' }
    }
  }
  return { ok: true, dir }
}

/** معاينة حقيقية من داخل الـAgent: static → رابط فوري · npm → تثبيت + dev server مُتحقق */
async function startPreviewFor(user, cwd, port = null) {
  const email = user.email
  const ws = userWorkspace(email)
  let dir
  try {
    dir = safeResolve(ws, String(cwd || '.'))
  } catch (e) {
    return { ok: false, error: String(e.message || e) }
  }
  const rel = path.relative(ws, dir) || '.'
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    let pkg = {}
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) } catch { /* noop */ }
    const script = pkg.scripts?.dev ? 'dev' : pkg.scripts?.start ? 'start' : pkg.scripts?.preview ? 'preview' : null
    if (!script) return { ok: false, error: 'مشروع npm بلا سكربت dev/start/preview — لا يمكن تشغيل معاينة حية' }
    // نفّذ التثبيت فعليًا إن لزم
    if (!fs.existsSync(path.join(dir, 'node_modules'))) {
      emitUser(email, { type: 'agent', agent: 'Coding', message: `📦 تثبيت الاعتماديات في ${rel}…`, status: 'running' })
      const instRes = await tools.terminal.run({
        command: 'npm install', workspace: ws, cwd: rel, timeoutMs: 300000,
        onData: (kind, chunk) => emitUser(email, { type: 'terminal_data', kind, data: chunk.slice(0, 4000) }),
      })
      if (!instRes.ok) {
        return { ok: false, error: `فشل npm install:\n${String(instRes.stderr || instRes.output || '').slice(0, 1200)}` }
      }
    }
    const r = await procs.start({ email, cwd: rel, command: `npm run ${script}`, port })
    if (!r.ok) return { ok: false, error: r.error, logs: r.logs || null }
    return { ok: true, kind: 'npm', id: r.id, port: r.port, cwd: rel }
  }
  if (fs.existsSync(path.join(dir, 'index.html'))) {
    const share = ensureShare(email, rel === '.' ? '' : rel, path.basename(dir))
    return { ok: true, kind: 'static', url: share.url, cwd: rel }
  }
  return { ok: false, error: 'لا يوجد package.json ولا index.html — لا شيء لمعاينته' }
}

/** تسمية بشرية عربية للعملية (بطاقات مفهومة بدل raw) — تُبقي بادئتي ▶️/✅ ليتوافق عارض الكود */
function toolLabel(name, params) {
  const p = params?.path || params?.cwd || ''
  switch (name) {
    case 'writeFile': return `كتابة ملف: ${params?.path || ''}`
    case 'readFile': return `قراءة ملف: ${params?.path || ''}`
    case 'listDir': return `سرد مجلد: ${params?.path || '.'}`
    case 'replaceInFile': return `تعديل دقيق: ${params?.path || ''}`
    case 'deleteFile': return `حذف ملف: ${params?.path || ''}`
    case 'createDir': return `إنشاء مجلد: ${params?.path || ''}`
    case 'gitStatus': return `فحص حالة git في ${p || '.'}`
    case 'gitDiff': return `عرض فروقات git في ${p || '.'}`
    case 'gitCommit': return `توثيق git: ${String(params?.command || '').slice(-80)}`
    case 'installDeps': return `تثبيت الاعتماديات في ${p}`
    case 'buildProject': return `بناء المشروع في ${p}`
    case 'runTests': return `تشغيل الاختبارات في ${p}`
    case 'startPreview': return `بدء معاينة حية في ${p}`
    default: return null
  }
}
function runRepairs(user) {
  const ws = userWorkspace(user.email)
  try {
    const result = repairUserSites(user.email)
    for (const f of result.fixed || []) {
      const rel = path.relative(ws, f.file) || 'index.html'
      emitUser(user.email, { type: 'workspace_changed', path: rel, action: 'write', repaired: true, fixes: f.fixes })
    }
    return result
  } catch {
    return { projects: 0, repaired: 0, fixed: [] }
  }
}

function toCallParams(name, args) {
  switch (name) {
    case 'writeFile':
      return { action: 'writeFile', path: args.path, content: String(args.content ?? '') }
    case 'readFile':
      return { action: 'readFile', path: args.path }
    case 'listDir':
      return { action: 'listDir', path: args.path || '.' }
    case 'replaceInFile':
      return { action: 'replaceInFile', path: args.path, old: args.old, new: args.new, replaceAll: !!args.replaceAll }
    case 'deleteFile':
      return { action: 'deleteFile', path: args.path }
    case 'createDir':
      return { action: 'mkDir', path: args.path }
    case 'runTerminal':
      return { command: args.command, cwd: args.cwd || '.' }
    default:
      return args
  }
}

async function runTool(user, name, args, onTerm, baseWs = null, execOpts = {}) {
  const agentTool = toolSchemaMap()[name]
  if (!agentTool) return { ok: false, error: `unknown tool: ${name}` }
  const tool = tools[agentTool]
  const ws = baseWs || userWorkspace(user.email)
  const signal = execOpts.signal || null
  if (signal?.aborted) return { ok: false, error: 'أُوقف التنفيذ', stopped: true }

  // ── بحث داخل العملية: آمن وفوري، بلا بوابة ──
  if (agentTool === 'search') {
    const q = String(args?.query || '').slice(0, 120)
    if (!q) return { ok: false, error: 'query مطلوب' }
    const sub = typeof args?.dir === 'string' && args.dir ? args.dir : '.'
    let scope = ws
    try {
      scope = safeResolve(ws, sub)
    } catch (e) {
      return { ok: false, error: String(e.message || e) }
    }
    emitUser(user.email, { type: 'agent_event', agent: 'Coding', tool: 'search', message: `🔎 بحث: ${q}`, status: 'running' })
    try {
      const r = await searchTools.searchFiles({ workspace: scope, query: q, limit: 15 })
      emitUser(user.email, { type: 'agent_event', agent: 'Coding', tool: 'search', message: `🔎 نتائج البحث عن "${q}" (${(r.hits || []).length})`, status: 'success', data: r })
      return { ok: true, toolResult: JSON.stringify(r).slice(0, 3000) }
    } catch (err) {
      return { ok: false, error: String(err?.message || err) }
    }
  }

  // ── عمليات المعاينة الحقيقية ──
  if (agentTool === 'proc') {
    if (name === 'stopPreview') {
      const r = procs.stop(user.email, String(args?.id || ''))
      return r.ok ? { ok: true, toolResult: JSON.stringify(r) } : { ok: false, error: r.error }
    }
    if (name === 'previewLogs') {
      const r = procs.logs(user.email, String(args?.id || ''), Number(args?.tail || 100))
      return r.ok ? { ok: true, toolResult: JSON.stringify(r).slice(0, 3000) } : { ok: false, error: r.error }
    }
    if (name === 'startPreview') {
      const cwd = args?.cwd || '.'
      const gate = await gateTool({ email: user.email, tool: 'terminal', command: `بدء معاينة حية (dev server) في ${cwd}`, cwd, signal })
      if (!gate.approved) {
        emitUser(user.email, { type: 'agent_event', agent: 'Coding', tool: 'preview', message: `⛔ رُفض بدء المعاينة — ${gate.reason || ''}`, status: 'error' })
        return { ok: false, error: gate.reason || 'denied by user', denied: true }
      }
      if (signal?.aborted) return { ok: false, error: 'أُوقف التنفيذ', stopped: true }
      emitUser(user.email, { type: 'agent_state', state: 'BUILDING', tool: 'preview' })
      const r = await startPreviewFor(user, cwd, args?.port ? Number(args.port) : null)
      return r.ok
        ? { ok: true, toolResult: JSON.stringify({ preview: r }).slice(0, 1500) }
        : { ok: false, error: r.error }
    }
  }

  // ── بناء الأمر الحقيقي لأدوات git/npm ──
  let constructed = null
  if (['gitStatus', 'gitDiff', 'gitCommit', 'gitInit', 'installDeps', 'buildProject', 'runTests'].includes(name)) {
    constructed = agentCommandFor(name, args || {})
    if (!constructed) return { ok: false, error: 'وسائط غير صالحة' }
    if (constructed.error) return { ok: false, error: constructed.error }
    // حارس المستودع المباشر لأدوات القراءة/الكتابة (status/diff/commit) — لا صعود للأب أبدًا
    if (['gitStatus', 'gitDiff', 'gitCommit'].includes(name)) {
      const repo = assertDirectRepo(ws, args?.cwd || '.')
      if (!repo.ok) {
        emitUser(user.email, { type: 'agent_event', agent: 'Coding', tool: 'git', message: `⛔ ${repo.error}`, status: 'error', data: { denied: true } })
        return { ok: false, error: repo.error }
      }
    }
    // تحقق صادق قبل التنفيذ: package.json والسكربت المطلوب
    if (constructed.needPkg || constructed.needScript) {
      const pkgCheck = checkPkgScript(ws, args?.cwd || '.', constructed.needScript || null)
      if (!pkgCheck.ok) return { ok: false, error: pkgCheck.error }
    }
  }

  const params = { workspace: ws, cwd: '.', ...toCallParams(name, args || {}) }
  if (agentTool === 'filesystem' && params.cwd) delete params.cwd
  if (constructed) {
    params.command = constructed.command
    params.cwd = args?.cwd || '.'
    params.timeoutMs = constructed.timeoutMs || 120000
  }
  if (agentTool === 'terminal') {
    params.workspace = ws
    params.onData = (kind, chunk) => onTerm(kind, chunk)
    params.signal = signal
    // ── بوابة الموافقة الحقيقية: الأوامر الحساسة تنتظر قرار المستخدم ──
    const gateKind = name === 'gitCommit' ? 'git' : 'terminal'
    const gateCmd = constructed ? constructed.command : (args?.command || '')
    const gateCwd = args?.cwd || '.'
    const gate = await gateTool({
      email: user.email, tool: gateKind, command: gateCmd, cwd: gateCwd, signal, workspace: ws,
      ...(name === 'gitCommit' && constructed?.commitMsg ? { path: null } : {}),
    })
    if (!gate.approved) {
      emitUser(user.email, {
        type: 'agent_event',
        agent: 'Coding',
        tool: agentTool,
        message: `⛔ رُفض/أُلغي الأمر: ${String(gateCmd).slice(0, 90)} — ${gate.reason || ''}`,
        status: 'error',
        data: { denied: true, reason: gate.reason },
      })
      return { ok: false, error: gate.reason || 'denied by user', denied: true }
    }
    if (signal?.aborted) return { ok: false, error: 'أُوقف التنفيذ', stopped: true }
    if (constructed?.state) emitUser(user.email, { type: 'agent_state', state: constructed.state, tool: name })
  }
  if (name === 'deleteFile') {
    // ── الحذف حساس دائمًا: موافقة صريحة ──
    const gate = await gateTool({ email: user.email, tool: 'filesystem', action: 'deleteFile', path: args?.path || '', signal })
    if (!gate.approved) {
      emitUser(user.email, { type: 'agent_event', agent: 'Coding', tool: agentTool, message: `⛔ رُفض حذف ${args?.path || ''} — ${gate.reason || ''}`, status: 'error' })
      return { ok: false, error: gate.reason || 'denied by user', denied: true }
    }
    if (signal?.aborted) return { ok: false, error: 'أُوقف التنفيذ', stopped: true }
  }

  audit({ user: user.email, agent: 'coding', tool: agentTool, action: params.action || 'terminal', input: JSON.stringify(params).slice(0, 300) })
  const label = toolLabel(name, { ...params, command: params.command || args?.command }) || (name === 'runTerminal' ? `$ ${args?.command?.slice(0, 90)}` : `${name} ${params.path || ''}`)
  emitUser(user.email, {
    type: 'agent_event',
    agent: 'Coding',
    tool: agentTool,
    message: `▶️ ${label}`,
    status: 'running',
  })
  try {
    const result = await tool.run(params)
    const mark = result.ok ? '✅' : '❌'
    emitUser(user.email, { type: 'agent_event', agent: 'Coding', tool: agentTool, message: `${mark} ${label}`, status: result.ok ? 'success' : 'error', data: result })
    audit({ user: user.email, agent: 'coding', tool: agentTool, result: JSON.stringify(result).slice(0, 400), status: result.ok ? 'success' : 'error' })
    if (agentTool === 'filesystem' && params.action === 'writeFile' && result.ok) {
      emitUser(user.email, { type: 'workspace_changed', path: params.path, action: 'write' })
    }
    if (agentTool === 'filesystem' && params.action === 'replaceInFile' && result.ok) {
      emitUser(user.email, { type: 'workspace_changed', path: params.path, action: 'patch', offset: result.offset, replaced: result.replaced })
    }
    if (agentTool === 'filesystem' && ['readFile', 'listDir', 'tree'].includes(params.action)) {
      return { ok: true, toolResult: JSON.stringify(result).slice(0, 3000) }
    }
    return result
  } catch (err) {
    audit({ user: user.email, agent: 'coding', tool: agentTool, result: String(err), status: 'error' })
    return { ok: false, error: String(err) }
  }
}

async function* runCoding(user, userMessage, opts = {}) {
  const canc = opts?.signal || null
  const ws = userWorkspace(user.email)
  await seedTemplates(user.email)
  const editMode = opts?.mode === 'edit'
  const proposeMode = opts?.mode === 'propose'
  let toolBaseWs = ws
  const memory = editMode || proposeMode ? '' : contextBlock(user.email, userMessage)
  const messages = []
  let workingRoot = '.'
  if (editMode || proposeMode) {
    if (opts.root) workingRoot = guessProjectRoot(ws, opts.root) || '.'
    yield { type: 'coding_start', project: detectProjectName(userMessage), request: userMessage, mode: proposeMode ? 'propose' : 'edit', element: opts.element || null, root: opts.root || null }
    messages.push({ role: 'system', content: proposeMode ? PROPOSE_PROMPT(opts.element || null, userMessage) : EDIT_SYSTEM_PROMPT(opts.element || null, userMessage) })
    messages.push({
      role: 'user',
      content: `Workspace root: ${ws}\nThis project's folder: "${workingRoot}". Use filesystem paths RELATIVE to that folder (e.g. "style.css", "index.html", "app.js") — never prefix them with the folder name.\n\n${proposeMode ? 'The user wants this change applied ONLY AFTER approval. Produce the numbered plan now (read-only).' : 'The user approved the proposal. Apply this change now: read the source files first, then use replaceInFile (or writeFile as a last resort). Verify before replying.'}\n\nUser request: ${userMessage}`,
    })
  } else {
    const projectName = detectProjectName(userMessage)
    const projectRoot = siteRootFor(user.email, projectName)
    workingRoot = projectRoot
    const share = ensureShare(user.email, projectRoot, projectName)
    emitProjectState(user.email, share.project)
    yield { type: 'coding_start', project: projectName, request: userMessage, mode: 'build', root: projectRoot, live: { code: share.code, url: share.url } }
    const design = opts?.design && typeof opts.design === 'object' ? opts.design : null
    const designSpec = design
      ? `\n\nDESIGN SPEC — خطة المعمار المصغّرة (التزم بها ما أمكن):\n- لوحة الألوان المقترحة: ${Array.isArray(design.palette) ? (design.palette.join(' ') || '—') : '—'}\n- الحزمة التقنية: ${design.stack || 'html/css/js'}\n- الخطوات:${Array.isArray(design.steps) && design.steps.length ? `\n${design.steps.map((s) => `  • ${s}`).join('\n')}` : ' تنفيذ مباشر'}\n- لا تنسَ لمسةً توقيعيةً واحدة تميّز الموقع (motif مميز)، وخطوط عربية احترافية إن كان المحتوى عربيًا.`
      : ''
    messages.push(
      { role: 'system', content: SYSTEM_PROMPT + memory },
      {
        role: 'user',
        content:
          `Workspace root: ${ws}\n\nTHIS PROJECT'S OWN FOLDER: "${projectRoot}" — write EVERY file of this site inside it with full prefixed paths (e.g. "${projectRoot}/index.html", "${projectRoot}/style.css", "${projectRoot}/app.js"). Never write outside that folder. Premium templates live in "_ghennai/templates" (copy a folder into "${projectRoot}" then edit it if helpful).\n\nUser request: ${userMessage}${designSpec}\n\nWhen done, reply with the final summary.` +
          `\n(ملاحظة نظام: إذا سُئلت من صنعك / من الذي صنعك / من برمجك / who created you؟ فأجب أن صانعك هو **محمد غناي (Mohamed Ghennay)** المطوّر الوحيد لـ GHENNAI.)`,
      },
    )
  }

  if ((editMode || proposeMode) && workingRoot && workingRoot !== '.') {
    toolBaseWs = path.resolve(ws, workingRoot)
  }

  let built = false
  let attempts = 0
  let fixRounds = 0
  // ميزانية صقل مستقلة: إصلاحات التحقق لا تأكل جولات الجمال — الموقع العاري يُصقل دائمًا
  let polishRounds = 0
  const MAX_POLISH_ROUNDS = 2
  let writesHappened = false

  const consumeTurn = async function* (msgs) {
    const liveFiles = new Set()
    let result = null
    let live = false
    const body = () => {
      const total = msgs.reduce((a, m) => a + (typeof m.content === 'string' ? m.content.length : 0), 0)
      for (let i = 1; i < msgs.length - 1; i++) {
        const m = msgs[i]
        if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 1200) m.content = m.content.slice(0, 1200) + '…'
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
          m.tool_calls = m.tool_calls.map((tc) => {
            const fn = tc.function || {}
            const args = String(fn.arguments || '')
            if (args.length <= 1200 && total <= 14000) return tc
            let path = ''
            try { path = JSON.parse(args)?.path || '' } catch { /* noop */ }
            return { ...tc, function: { ...fn, arguments: JSON.stringify({ path: String(path).slice(0, 120), content: '…', old: '…', new: '…' }) } }
          })
        }
      }
      return msgs
    }
    for await (const ev of codestreamGen({ messages: body(), tools: TOOL_SCHEMAS, provider: 'auto', signal: canc })) {
      if (ev.kind === 'done') { result = ev.result; continue }
      if (ev.kind === 'text') {
        live = true
        yield { type: 'stream_chunk', content: ev.text }
      } else if (ev.kind === 'toolArgs' && ev.delta) {
        live = true
        const file = ev.file || null
        if (file) {
          const first = !liveFiles.has(file)
          if (first) {
            liveFiles.add(file)
            yield { type: 'code_token', action: 'open', file }
          }
          yield { type: 'code_token', content: ev.delta, file }
        }
      }
    }
    return { result, live }
  }

  const goodFiles = new Map()
  const executeToolCalls = async function* (msgs, toolCalls) {
    let allOk = true
    for (const tc of toolCalls) {
      let name = tc?.function?.name
      let args = tc?.function?.arguments
      if (typeof args === 'string') {
        try { args = JSON.parse(args) } catch { args = {} }
      }
      if ((editMode || proposeMode) && typeof args?.path === 'string' && workingRoot && workingRoot !== '.') {
        const bare = workingRoot.replace(/\/+$/, '')
        const p = args.path
        const prefixed = bare + '/'
        args.path = p === bare ? '.' : p.startsWith(prefixed) ? p.slice(bare.length + 1) : p
      }
      if (name === 'writeFile' && args?.content) {
        // حماية من استجابات مشوّهة (مثل429 من المزوّد) — لا تكتب محتوى ناقصًا/مصغّرًا على ملف جيد.
        // ملاحظة: المسار الحقيقي يُحسب من toolBaseWs دائمًا (في البناء المسارات مسبوقة بالمجلد، وفي التعديل مجردة).
        const incoming = String(args.content || '')
        const target = path.resolve(toolBaseWs || ws, args.path)
        const looksHtml = /\.html?$/i.test(String(args.path))
        const looksDoc = looksHtml && (/<!DOCTYPE/i.test(incoming) || /<html/i.test(incoming))
        const truncatedHtml = looksDoc && !/<\/html>/i.test(incoming)
        let existing = null
        try {
          if (fs.existsSync(target)) existing = fs.readFileSync(target, 'utf8')
        } catch { /* noop */ }
        const shrinksGood = existing != null && existing.length > 500 && (incoming.length < 50 || incoming.length < existing.length * 0.3)
        const shouldSkip = truncatedHtml || shrinksGood
        if (shouldSkip) {
          const why = truncatedHtml
            ? 'المزوّد أعاد الصفحة مقصوصة (نهايتها ناقصة)'
            : `المحتوى الوارد (${incoming.length} حرف) يصغّر الملف الجيد (${existing.length} حرف) بشكل مريب — رُفض لحماية موقعك`
          yield { type: 'agent', agent: 'Coding', message: `⚠️ تم تخطي كتابة ${args.path} — ${why}. أعد المحاولة بعد لحظات.`, status: 'running' }
          messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify({ ok: false, rejected: true, error: 'rejected destructive write — retry with FULL complete content' }).slice(0, 3000) })
          attempts++
          continue
        }
        writesHappened = true
        yield { type: 'code_token', action: 'open', file: args.path }
        await sleep(120)
        yield* yieldTyped(args.content, { file: args.path, rate: 3, chunk: 64 })
      } else if (name === 'replaceInFile') {
        writesHappened = true
        yield { type: 'code_token', action: 'edit', file: args.path }
        await sleep(80)
      } else if (name === 'copyFile' || name === 'moveFile') {
        writesHappened = true
      }
      const result = await runTool(user, name, args || {}, (kind, chunk) => {
        emitUser(user.email, { type: 'terminal_data', kind, data: chunk })
      }, toolBaseWs, { signal: canc })
      let toolOut = JSON.stringify({ ok: result.ok, ...result }).slice(0, 3000)
      if (result.ok && name === 'writeFile' && /\.html?$/i.test(String(args.path))) {
        // لقطة نسخة جيدة: أي كتابة لاحقة ناقصة تُرجع الملف لحالته السليمة بدل تدمير الموقع
        try {
          const target = path.resolve(toolBaseWs || ws, args.path)
          const written = fs.readFileSync(target, 'utf8')
          const key = String(args.path).replace(/^[\/\\]+/, '').split('?')[0]
          const looksDoc = /<!DOCTYPE/i.test(written) || /<html/i.test(written)
          const incomplete = looksDoc && !/<\/html>/i.test(written)
          if (incomplete) {
            const good = goodFiles.get(key)
            if (good != null && good !== written) {
              fs.writeFileSync(target, good, 'utf8')
              const msgText = `⚠️ تمت استعادة index.html من النسخة السليمة — المزوّد أعاد الصفحة ناقصة (بدون </html>).`
              yield { type: 'agent', agent: 'Coding', message: msgText, status: 'running' }
              toolOut = JSON.stringify({ ok: false, restored: true, error: 'restored good snapshot after incomplete write' })
              allOk = false
            }
          } else if (written.length > 200) {
            // لا تخزّن قمامة (مثل "…") كلقطة سليمة — اللقطة للنسخ الجوهرية فقط
            goodFiles.set(key, written)
          }
        } catch { /* noop */ }
      }
      if (!result.ok) allOk = false
      else if (name === 'runTerminal' || name === 'writeFile') built = true
      attempts++
      msgs.push({ role: 'tool', tool_call_id: tc.id, name, content: toolOut })
    }
    return allOk
  }

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    attempts++
    let res
    let streamedLive = false
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const r = yield* consumeTurn(messages)
        if (!r.result && !r.live) throw new Error('استجابة فارغة من المزوّد')
        res = r.result
        streamedLive = r.live
        break
      } catch (streamErr) {
        console.error('[CODING STREAM ERR]', streamErr?.message || String(streamErr))
        if (canc?.aborted) {
          yield { type: 'code_token', action: 'done' }
          return
        }
        if (attempt < 2) {
          yield { type: 'agent', agent: 'Coding', message: `انقطاع مؤقت في المزوّد — إعادة المحاولة (${attempt + 1}/3)…`, status: 'retry' }
          await sleep(800 * (attempt + 1))
        } else if (writesHappened && !canc?.aborted) {
          runRepairs(user)
          const doneMsg = 'اكتملت كتابة ملفات الموقع وعرضها مباشرةً — جارٍ توليد الملخص النهائي (أعد المحاولة إن احتجت أي تعديل إضافي).'
          yield { type: 'agent', agent: 'Coding', message: doneMsg, status: 'success' }
          yield { type: 'code_token', action: 'done' }
          yield { type: 'coding_done', built: true, content: doneMsg }
          yield { type: 'answer', content: doneMsg }
          return
        } else {
          yield { type: 'code_token', action: 'done' }
          yield { type: 'agent', agent: 'Coding', message: `خطأ في النموذج: ${streamErr.message}`, status: 'error' }
          yield { type: 'answer', content: `تعذّر تنفيذ المهمة بسبب خطأ النموذج: ${streamErr.message}` }
          return
        }
      }
    }

    const toolCalls = res?.toolCalls || []
    if (!toolCalls.length) {
      runRepairs(user)

      // ── وضع الاقتراح: يخطط فقط، والمستخدم يوافق قبل أي تعديل ──
      if (proposeMode) {
        if (res.content && !streamedLive) yield* yieldTyped(res.content, { rate: 5, chunk: 120 })
        yield { type: 'code_token', action: 'done' }
        yield { type: 'edit_proposal', element: opts.element || null, root: workingRoot, request: userMessage, summary: res.content || '' }
        yield { type: 'coding_done', built: false, content: res.content || '' }
        yield { type: 'answer', content: res.content || 'اقتراحي جاهز — اضغط «نفّذ» لتطبيق التعديل.' }
        return
      }

      // ── الفحص الشامل قبل إعلان النجاح ──
      const root = workingRoot
      let checks = []
      if (!editMode) {
        checks = validateUserSite(user.email, root)
        yield { type: 'validation_report', project: root || '.', ok: checks.every((c) => c.ok), checks: checks.slice(0, 40) }
        const failing = checks.filter((c) => !c.ok)
        if (failing.length && fixRounds < MAX_FIX_ROUNDS) {
          fixRounds++
          built = true
          yield { type: 'agent', agent: 'Coding', message: `الفحص رصد ${failing.length} مشكلة — يعالجها تلقائيًا (جولة ${fixRounds}/${MAX_FIX_ROUNDS})…`, status: 'running' }
          const list = failing.map((c, n) => `${n + 1}. [${c.file || 'site'}] ${c.label}`).join('\n')
          messages.push({ role: 'system', content: `VALIDATION REPORT — these are the REAL problems in the current project files:\n${list}\nFix each one in its actual file now: readFile the file, correct it (writeFile/replaceInFile), and re-verify. Do not claim fixes that are not actually applied.` })
          messages.push({ role: 'user', content: 'أصلح كل المشاكل المذكورة أعلاه في ملفاتها الحقيقية الآن، وتأكد أنها أُصلحت فعليًا، ثم أعد الملخص النهائي.' })
          if (messages.length > 40) messages.splice(4, messages.length - 36)
          continue
        }
        // ── جولة صقل جمالي: أي مظهر عارٍ يُصقل — بميزانية مستقلة عن إصلاحات التحقق ──
        if (polishRounds < MAX_POLISH_ROUNDS) {
          const styleFlags = designQualityCheck(user.email, root)
          if (styleFlags.length >= 1) {
            polishRounds++
            built = true
            yield { type: 'agent', agent: 'Coding', message: `اللمسة الأخيرة: رفع الحس الجمالي (جولة ${polishRounds}/${MAX_POLISH_ROUNDS})…`, status: 'running' }
            const list = styleFlags.map((c, n) => `${n + 1}. ${c.label}`).join('\n')
            messages.push({
              role: 'system',
              content: `DESIGN POLISH PASS — the site currently looks generic/average. Elevate it to a premium, memorable look by addressing EVERY point below in the actual files (readFile → edit CSS/HTML). Keep the palette coherent (2-3 brand colors + neutrals), keep everything working, keep it RTL-correct.\nImprovements to apply:\n${list}\nAlso ensure at least one signature creative touch (gradient logo, glowing gradient-border cards, diagonal divider, marquee, rotating badge, floating decoration…), real theme photos with gradient fallbacks, 3D depth (tilt/parallax), a preloader, lively elements (counters/slider/accordion), and a real Google-Fonts Arabic font for Arabic sites.`,
            })
            messages.push({ role: 'user', content: 'طبّق تحسينات اللمسة الجمالية أعلاه على ملفاتك الحقيقية الآن، وتأكد أن التغييرات فعلاً على القرص، ثم أعد الملخص النهائي.' })
            if (messages.length > 40) messages.splice(4, messages.length - 36)
            continue
          }
        }
      }

      // ── التحقق النهائي الصادق: ممنوع إعلان النجاح على ملف مدمّر/ناقص ──
      if (!editMode && !proposeMode) {
        const v = verifySiteBuilt(user.email, root)
        if (!v.ok) {
          yield { type: 'agent', agent: 'Coding', message: `❌ فشل التحقق النهائي: ${v.reason}`, status: 'error' }
          yield { type: 'code_token', action: 'done' }
          const failMsg = `❌ لم يكتمل البناء — ${v.reason}.\n\nالملفات المكتوبة محفوظة في مساحة العمل كما هي. اضغط 🔧 «إصلاح تلقائي» لمحاولة التشخيص والإصلاح، أو أعد صياغة طلبك.`
          yield { type: 'coding_done', built: false, content: failMsg }
          yield { type: 'answer', content: failMsg }
          return
        }
      }

      // ── تسجيل المشروع + لقطة نسخة (Undo/Rollback) + الرابط الفوري ──
      const project = ensureProject(user.email, root, detectProjectName(userMessage))
      const nextVersion = (project.version || 0) + 1
      const share = ensureShare(user.email, root, project.name)
      try {
        snapshotProject(user.email, root, nextVersion)
        const meta = { version: nextVersion, lastBuild: Date.now(), built: built || attempts > 0, url: share.url, code: share.code, updatedAt: Date.now() }
        if (editMode) meta.status = 'idle'
        const saved = setProjectMeta(user.email, project.id, meta)
        emitProjectState(user.email, saved)
      } catch {
        /* النسخ الاحتياطي اختياري */
      }

      // ── الرابط الفوري: يتحرك خلف الرد ولا يعطّله — الرابط جاهز فورًا من خادمنا ──
      let autoPublish = false
      if (!editMode && (built || (attempts > 0 && fs.existsSync(path.join(toolBaseWs, 'index.html'))))) {
        autoPublish = true
        emitUser(user.email, { type: 'deploy_progress', stage: 'init', message: '🚀 اكتمل البناء — موقعك على رابط فوري جاهز للمشاركة…' })
        emitUser(user.email, { type: 'live_link', url: share.url })
      }
      const summary = res.content || ''
      // الرابط الكامل القابل للنقر داخل نص المحادثة (عام إن وُجد تونل، وإلا نسبي)
      const fullLink = autoPublish ? publicUrl(share.url) : null
      const withLink = `${summary}${fullLink ? `\n\n🚀 **اكتمل البناء! موقعك حي الآن:**\n[افتح موقعك المباشر 🚀](${fullLink})\n${fullLink}` : ''}`

      if (withLink) {
        if (streamedLive) {
          const added = withLink.slice(summary.length)
          if (added.trim()) yield { type: 'stream_chunk', content: added }
        } else {
          yield* yieldTyped(withLink, { rate: 5, chunk: 120 })
        }
      }
      yield { type: 'code_token', action: 'done' }
      yield { type: 'coding_done', built: built || attempts > 0, content: withLink, version: nextVersion, url: fullLink }
      yield { type: 'answer', content: withLink || 'انتهت المهمة.' }
      rememberProject(user.email, 'last', { summary: String(summary).slice(0, 400), ts: Date.now() })
      return
    }

    messages.push({ role: 'assistant', content: res.content || '', tool_calls: toolCalls })
    if (res.content && !streamedLive) {
      yield* yieldTyped(res.content, { rate: 6, chunk: 100 })
      await sleep(100)
    }

    yield* executeToolCalls(messages, toolCalls)
    if (messages.length > 40) messages.splice(4, messages.length - 36)
  }

  runRepairs(user)
  yield { type: 'code_token', action: 'done' }
  if (writesHappened) {
    // مسار نفاد الخطوات: نفس بوابة الجمال + الرابط الفوري — ممنوع تسليم عارٍ صامت
    if (!editMode && polishRounds < MAX_POLISH_ROUNDS) {
      const styleFlags = designQualityCheck(user.email, workingRoot)
      if (styleFlags.length >= 1) {
        polishRounds++
        yield { type: 'agent', agent: 'Coding', message: `اللمسة الأخيرة: رفع الحس الجمالي (جولة ${polishRounds}/${MAX_POLISH_ROUNDS})…`, status: 'running' }
        const list = styleFlags.map((c, n) => `${n + 1}. ${c.label}`).join('\n')
        messages.push({
          role: 'system',
          content: `DESIGN POLISH PASS — the site currently looks generic/average. Elevate it to a premium, memorable look by addressing EVERY point below in the actual files (readFile → edit CSS/HTML). Keep the palette coherent (2-3 brand colors + neutrals), keep everything working, keep it RTL-correct.\nImprovements to apply:\n${list}\nAlso ensure at least one signature creative touch (gradient logo, glowing gradient-border cards, diagonal divider, marquee, rotating badge, floating decoration…), real theme photos with gradient fallbacks, 3D depth (tilt/parallax), a preloader, lively elements (counters/slider/accordion), and a real Google-Fonts Arabic font for Arabic sites.`,
        })
        messages.push({ role: 'user', content: 'طبّق تحسينات اللمسة الجمالية أعلاه على ملفاتك الحقيقية الآن، وتأكد أن التغييرات فعلاً على القرص، ثم أعد الملخص النهائي.' })
        try {
          const r = yield* consumeTurn(messages)
          if (r.result?.toolCalls?.length) {
            yield* executeToolCalls(messages, r.result.toolCalls)
          }
        } catch { /* مسعى أخير بلا تأثير */ }
        if (messages.length > 40) messages.splice(4, messages.length - 36)
      }
    }
    const vTail = !editMode && !proposeMode ? verifySiteBuilt(user.email, workingRoot) : { ok: true }
    if (!vTail.ok) {
      const failMsg = `❌ لم يكتمل البناء — ${vTail.reason}.\n\nاضغط 🔧 «إصلاح تلقائي» لمحاولة التشخيص والإصلاح، أو أعد المحاولة.`
      yield { type: 'coding_done', built: false, content: failMsg }
      yield { type: 'agent', agent: 'Coding', message: failMsg, status: 'error' }
      yield { type: 'answer', content: failMsg }
      return
    }
    const tailProject = !editMode && !proposeMode ? ensureProject(user.email, workingRoot, detectProjectName(userMessage)) : null
    const tailShare = tailProject ? ensureShare(user.email, workingRoot, tailProject.name) : null
    const tailLink = tailShare ? publicUrl(tailShare.url) : null
    if (tailLink) {
      try {
        emitProjectState(user.email, tailShare.project)
        emitUser(user.email, { type: 'live_link', url: tailShare.url })
      } catch { /* البث اختياري */ }
    }
    const msg = `اكتمل بناء الموقع — تحقق من المعاينة الحية، ويمكنك طلب أي تعديل بعدها.${tailLink ? `\n\n🚀 **موقعك حي الآن:**\n[افتح موقعك المباشر 🚀](${tailLink})\n${tailLink}` : ''}`
    yield { type: 'coding_done', built, content: msg, url: tailLink }
    yield { type: 'agent', agent: 'Coding', message: tailLink ? `اكتمل البناء — الموقع حي: ${tailLink}` : msg, status: 'success' }
    yield { type: 'answer', content: msg }
  } else {
    yield { type: 'coding_done', built: false, content: 'تم الوصول للحد الأقصى من الخطوات.' }
    yield { type: 'agent', agent: 'Coding', message: 'الوصول إلى الحد الأقصى من الخطوات — التوقف.', status: 'error' }
    yield { type: 'answer', content: 'تم الوصول إلى الحد الأقصى لخطوات التنفيذ. تحقق من مساحة العمل لمعرفة ما تم إنجازه.' }
  }
}

export { runCoding, SYSTEM_PROMPT }