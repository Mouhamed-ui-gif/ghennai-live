import path from 'path'
import tools from '../tools/registry.js'
import { generate } from '../lib/modelRouter.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'
import { userWorkspace } from '../lib/paths.js'
import { contextBlock, rememberProject } from '../lib/memory.js'
import { seedTemplates } from '../lib/templateKit.js'
import { repairUserSites, validateUserSite } from '../lib/siteDoctor.js'
import { ensureProject, setProjectMeta, snapshotProject, listVersions, guessProjectRoot, siteRootFor } from '../lib/projects.js'

const MAX_ITERATIONS = 12
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

const SYSTEM_PROMPT = `You are GHENNAI's autonomous Coding Agent — a senior full-stack product engineer. You build PROFESSIONAL, production-grade websites inside the user's workspace.

You build real projects by actually using tools:
- filesystem: create/read/append/delete files, list and make directories (actions: writeFile, readFile, appendFile, deleteFile, listDir, mkDir, tree). Use RELATIVE paths from the workspace root.
- terminal: run shell commands (bash) INSIDE the workspace to scaffold, install (npm), run and test. Set "cwd" to the relative folder (default ".").

TEMPLATES:
A folder "_ghennai/templates" exists in the workspace with ready premium templates: "modern-saas", "portfolio", "restaurant". Each has index.html + style.css + app.js.
- Pick the template closest to the request, COPY its folder to the project root, then READ and EDIT those files to match the user's request precisely (content, colors, sections). This gives a professional result fast.
- If no template fits, build from scratch following the DESIGN RULES below.

PROFESSIONAL DESIGN RULES (apply always):
1. Structure: sticky glass navbar (logo + links + CTA button), hero with headline + subtext + primary CTA + trust badge, features grid (3-6 cards with icons), "how it works" steps, stats strip, testimonials, pricing (3 tiers) or portfolio grid, FAQ (accordion), final CTA, rich footer with columns.
2. Visual polish: deep dark theme with a vibrant gradient accent (indigo→cyan or violet→pink), radial glow behind hero, glass cards (rgba background + border + backdrop-filter), soft shadows, rounded-2xl corners, small "chip" badges, gradient text for headlines (background-clip:text), animated buttons with hover lift/glow.
3. Typography: system font stack with Tajawal/Cairo fallback + Inter; clamp() responsive type scale (headline ~clamp(2.2rem,6vw,4rem)); generous line-height and spacing.
4. Interactivity: mobile hamburger menu, smooth scroll, scroll-reveal (IntersectionObserver adding .in), hover/tilt effects on cards, subtle animated gradient "aurora" blobs in hero, counters animating, FAQ accordion, back-to-top button.
5. Responsive & quality: mobile-first grid (grid-template-columns: repeat(auto-fit,minmax(...))), media queries, prefers-reduced-motion support, semantic HTML5, valid CSS, no broken links — use real placeholder images from https://images.unsplash.com or https://picsum.photos when images are needed.
6. Localization: if the request or UI language is Arabic, set <html lang="ar" dir="rtl"> and write content in Arabic; keep bilingual nav simple.
7. Always include: meta description, viewport, favicon (inline SVG data URI), and a comment header per file.

RULES:
1. Actually DO the work with tools. Never claim something was created unless a tool succeeded and a verification tool (readFile or ls) confirmed it.
2. Always verify after creating files: use readFile or "ls -R ." before final answer.
3. If a command fails, read stderr, fix, retry. Never stop at the first error.
4. Never run destructive commands (rm -rf /, mkfs, etc). Never operate outside the workspace.
5. Write complete real files, not placeholders or "/* ... */" stubs.
6. For static sites (HTML/CSS/JS) write the files directly — do NOT scaffold with npm/vite unless the user explicitly asked for a React/app project.
7. Finish with a clear summary in the user's language: what was built (pages/sections), how to open it, and the file tree.
8. INTEGRITY: Never reference a file that does not exist. Before finishing, READ BACK your index.html and confirm every local href="..." and src="..." points to a real file you created. Never write href="style.css" or src="app.js" without also writing those files. Never use Tailwind classes (flex, bg-*, p-4, text-*, grid, etc.) unless you also include a real stylesheet that styles them — either copy a complete template (index.html + style.css + app.js together) or DROP external references and INLINE all CSS in a <style> tag and JS in a <script> tag inside index.html (the lightest, most robust option). Generated HTML must start with <!DOCTYPE html> immediately.
9. PREFER the project templates in "_ghennai/templates": pick the closest one, COPY the whole folder (index.html + style.css + app.js together, do not split them), then edit its content/colors/sections to match the request. Template folders already contain complete working CSS/JS.
10. JS SAFETY (critical): Any JavaScript you write must NEVER crash the page. If you use getElementById/querySelector, GUARD the result before touching it: const el = document.getElementById('x'); if (el) { el.addEventListener(...) }. Wrap all UI wiring inside document.addEventListener('DOMContentLoaded', () => {...}). Every id/class referenced in the JS MUST exist in the same HTML file — if the HTML lacks the element, either add the element to the HTML or skip that feature. Never call .addEventListener/.classList/.style on a possibly-null node. Test mentally that the page loads with zero JS errors.

CREATOR INFO: You are part of GHENNAI — created and built with passion by **محمد غناي (Mohamed Ghennay)**, the sole creator and developer of Ghennai. If the user asks "من صنعك؟ / من الذي صنعك؟ / who made you?", answer proudly: "صنعني محمد غناي". 

FINAL POLISH PASS (always do before finishing):
- Re-read every generated HTML/CSS/JS mentally or via readFile and fix: broken links, empty hrefs, unclosed tags, wrong RTL/LTR direction, mobile overflow.
- Elevate the design: ensure hero has a gradient/glow, cards have hover effects, sections breathe (clamp type scale), colors form a coherent palette, there's at least one micro-interaction (reveal/counter/tilt/hover), and a custom favicon + meta description.
- Confirm the site looks "legendary" — bold, premium, modern — not default/dull. If it looks plain, upgrade it before answering.
- Never leave debugging console.logs or TODO comments in delivered files.`

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
]

function toolSchemaMap() {
  return { writeFile: 'filesystem', readFile: 'filesystem', listDir: 'filesystem', replaceInFile: 'filesystem', runTerminal: 'terminal' }
}

/** فحص وإصلاح مواقع ناقصة بعد انتهاء البناء — يخطّر الواجهة بتحديث المعاينة */
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
    case 'runTerminal':
      return { command: args.command, cwd: args.cwd || '.' }
    default:
      return args
  }
}

async function runTool(user, name, args, onTerm) {
  const agentTool = toolSchemaMap()[name]
  if (!agentTool) return { ok: false, error: `unknown tool: ${name}` }
  const tool = tools[agentTool]
  const ws = userWorkspace(user.email)
  const params = { workspace: ws, cwd: '.', ...toCallParams(name, args || {}) }
  if (agentTool === 'filesystem' && params.cwd) delete params.cwd
  if (agentTool === 'terminal') {
    params.workspace = ws
    params.onData = (kind, chunk) => onTerm(kind, chunk)
  }

  audit({ user: user.email, agent: 'coding', tool: agentTool, action: params.action || 'terminal', input: JSON.stringify(params).slice(0, 300) })
  emitUser(user.email, {
    type: 'agent_event',
    agent: 'Coding',
    tool: agentTool,
    message: name === 'runTerminal' ? `▶️ $ ${args?.command?.slice(0, 90)}` : `▶️ filesystem:${params.action} ${params.path}`,
    status: 'running',
  })
  try {
    const result = await tool.run(params)
    emitUser(user.email, { type: 'agent_event', agent: 'Coding', tool: agentTool, message: `✅ ${name}`, status: result.ok ? 'success' : 'error', data: result })
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
  const ws = userWorkspace(user.email)
  await seedTemplates(user.email)
  const editMode = opts?.mode === 'edit'
  const memory = editMode ? '' : contextBlock(user.email, userMessage)
  const messages = []
  let workingRoot = '.'
  if (editMode) {
    if (opts.root) workingRoot = guessProjectRoot(ws, opts.root) || '.'
    yield { type: 'coding_start', project: detectProjectName(userMessage), request: userMessage, mode: 'edit', element: opts.element || null, root: opts.root || null }
    messages.push({ role: 'system', content: EDIT_SYSTEM_PROMPT(opts.element || null, userMessage) })
    messages.push({
      role: 'user',
      content: `Workspace root: ${ws}\nThis project's folder: "${workingRoot}" — read/edit files ONLY inside it.\n\nThe user clicked this element in their live preview and wants this change applied.\nRead the source files first, then use replaceInFile (or writeFile as a last resort). Verify before replying.`,
    })
  } else {
    const projectName = detectProjectName(userMessage)
    const projectRoot = siteRootFor(user.email, projectName)
    workingRoot = projectRoot
    yield { type: 'coding_start', project: projectName, request: userMessage, mode: 'build', root: projectRoot }
    const registered = ensureProject(user.email, projectRoot, projectName)
    emitProjectState(user.email, registered)
    messages.push(
      { role: 'system', content: SYSTEM_PROMPT + memory },
      {
        role: 'user',
        content:
          `Workspace root: ${ws}\n\nTHIS PROJECT'S OWN FOLDER: "${projectRoot}" — write EVERY file of this site inside it with full prefixed paths (e.g. "${projectRoot}/index.html", "${projectRoot}/style.css", "${projectRoot}/app.js"). Never write outside that folder. Premium templates live in "_ghennai/templates" (copy a folder into "${projectRoot}" then edit it if helpful).\n\nUser request: ${userMessage}\n\nWhen done, reply with the final summary.` +
          `\n(ملاحظة نظام: إذا سُئلت من صنعك / من الذي صنعك / من برمجك / who created you؟ فأجب أن صانعك هو **محمد غناي (Mohamed Ghennay)** المطوّر الوحيد لـ GHENNAI.)`,
      },
    )
  }

  let built = false
  let attempts = 0
  let fixRounds = 0
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let res
    try {
      res = await generate({ messages, tools: TOOL_SCHEMAS })
    } catch (err) {
      let recovered = null
      for (let attempt = 0; attempt < 2 && !recovered; attempt++) {
        yield { type: 'agent', agent: 'Coding', message: `انقطاع مؤقت في المزوّد — إعادة المحاولة (${attempt + 1}/2)…`, status: 'retry' }
        await sleep(1500 * (attempt + 1))
        try { recovered = await generate({ messages, tools: TOOL_SCHEMAS }) } catch { /* noop */ }
      }
      if (recovered) {
        res = recovered
      } else {
        yield { type: 'code_token', action: 'done' }
        yield { type: 'agent', agent: 'Coding', message: `خطأ في النموذج: ${err.message}`, status: 'error' }
        yield { type: 'answer', content: `تعذّر تنفيذ المهمة بسبب خطأ النموذج: ${err.message}` }
        return
      }
    }

    const toolCalls = res.toolCalls || []
    if (!toolCalls.length) {
      runRepairs(user)

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
      }

      // ── تسجيل المشروع + لقطة نسخة (Undo/Rollback) ──
      const project = ensureProject(user.email, root, detectProjectName(userMessage))
      const nextVersion = (project.version || 0) + 1
      try {
        snapshotProject(user.email, root, nextVersion)
        const meta = { version: nextVersion, lastBuild: Date.now(), built: built || attempts > 0, updatedAt: Date.now() }
        if (editMode) meta.status = 'idle'
        const saved = setProjectMeta(user.email, project.id, meta)
        emitProjectState(user.email, saved)
      } catch {
        /* النسخ الاحتياطي اختياري */
      }

      if (res.content) yield* yieldTyped(res.content, { rate: 5, chunk: 120 })
      yield { type: 'code_token', action: 'done' }
      yield { type: 'coding_done', built: built || attempts > 0, content: res.content || '', version: nextVersion }
      yield { type: 'answer', content: res.content || 'انتهت المهمة.' }
      rememberProject(user.email, 'last', { summary: String(res.content).slice(0, 400), ts: Date.now() })
      return
    }

    messages.push({ role: 'assistant', content: res.content || '', tool_calls: toolCalls })
    if (res.content) {
      yield* yieldTyped(res.content, { rate: 6, chunk: 100 })
      await sleep(100)
    }

    let allOk = true
    for (const tc of toolCalls) {
      let name = tc?.function?.name
      let args = tc?.function?.arguments
      if (typeof args === 'string') {
        try { args = JSON.parse(args) } catch { args = {} }
      }
      if (name === 'writeFile' && args?.content) {
        yield { type: 'code_token', action: 'open', file: args.path }
        await sleep(120)
        yield* yieldTyped(args.content, { file: args.path, rate: 3, chunk: 220 })
      } else if (name === 'replaceInFile') {
        yield { type: 'code_token', action: 'edit', file: args.path }
        await sleep(80)
      }
      const result = await runTool(user, name, args || {}, (kind, chunk) => {
        emitUser(user.email, { type: 'terminal_data', kind, data: chunk })
      })
      if (!result.ok) allOk = false
      else if (name === 'runTerminal' || name === 'writeFile') built = true
      attempts++
      messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify({ ok: result.ok, ...result }).slice(0, 3000) })
    }
    if (messages.length > 40) messages.splice(4, messages.length - 36)
  }

  runRepairs(user)
  yield { type: 'code_token', action: 'done' }
  yield { type: 'coding_done', built, content: 'تم الوصول للحد الأقصى من الخطوات.' }
  yield { type: 'agent', agent: 'Coding', message: 'الوصول إلى الحد الأقصى من الخطوات — التوقف.', status: 'error' }
  yield { type: 'answer', content: 'تم الوصول إلى الحد الأقصى لخطوات التنفيذ. تحقق من مساحة العمل لمعرفة ما تم إنجازه.' }
}

export { runCoding, SYSTEM_PROMPT }