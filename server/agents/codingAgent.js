import path from 'path'
import tools from '../tools/registry.js'
import { generate } from '../lib/modelRouter.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'
import { userWorkspace } from '../lib/paths.js'
import { contextBlock, rememberProject } from '../lib/memory.js'
import { seedTemplates } from '../lib/templateKit.js'
import { repairUserSites } from '../lib/siteDoctor.js'

const MAX_ITERATIONS = 12

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
]

function toolSchemaMap() {
  return { writeFile: 'filesystem', readFile: 'filesystem', listDir: 'filesystem', runTerminal: 'terminal' }
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
    if (agentTool === 'filesystem' && ['readFile', 'listDir', 'tree'].includes(params.action)) {
      return { ok: true, toolResult: JSON.stringify(result).slice(0, 3000) }
    }
    return result
  } catch (err) {
    audit({ user: user.email, agent: 'coding', tool: agentTool, result: String(err), status: 'error' })
    return { ok: false, error: String(err) }
  }
}

async function* runCoding(user, userMessage) {
  const ws = userWorkspace(user.email)
  await seedTemplates(user.email)
  const memory = contextBlock(user.email, userMessage)
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + memory },
    { role: 'user', content: `Workspace root: ${ws}\n\nUser request: ${userMessage}\n\nTemplate folder "_ghennai/templates" already exists in the workspace. Use the tools to complete it. When done, reply with the final summary.` + `
(ملاحظة نظام: إذا سُئلت من صنعك / من الذي صنعك / من برمجك / who created you؟ فأجب أن صانعك هو **محمد غناي (Mohamed Ghennay)** المطوّر الوحيد لـ GHENNAI.)` },
  ]

  let built = false
  let attempts = 0
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let res
    try {
      res = await generate({ messages, tools: TOOL_SCHEMAS })
    } catch (err) {
      yield { type: 'agent', agent: 'Coding', message: `خطأ في النموذج: ${err.message}`, status: 'error' }
      yield { type: 'answer', content: `تعذّر تنفيذ المهمة بسبب خطأ النموذج: ${err.message}` }
      return
    }

    const toolCalls = res.toolCalls || []
    if (!toolCalls.length) {
      runRepairs(user)
      yield { type: 'coding_done', built: built || attempts > 0, content: res.content }
      yield { type: 'answer', content: res.content || 'انتهت المهمة.' }
      rememberProject(user.email, 'last', { summary: String(res.content).slice(0, 400), ts: Date.now() })
      return
    }

    messages.push({ role: 'assistant', content: res.content || '', tool_calls: toolCalls })

    let allOk = true
    for (const tc of toolCalls) {
      let name = tc?.function?.name
      let args = tc?.function?.arguments
      if (typeof args === 'string') {
        try { args = JSON.parse(args) } catch { args = {} }
      }
      const result = await runTool(user, name, args || {}, (kind, chunk) => {
        emitUser(user.email, { type: 'terminal_data', kind, data: chunk })
      })
      if (!result.ok) allOk = false
      else if (name === 'runTerminal') built = true
      else if (name === 'writeFile') built = true
      attempts++
      messages.push({ role: 'tool', tool_call_id: tc.id, name, content: JSON.stringify({ ok: result.ok, ...result }).slice(0, 3000) })
    }
    if (messages.length > 40) messages.splice(4, messages.length - 36)
  }

  runRepairs(user)
  yield { type: 'coding_done', built, content: 'تم الوصول للحد الأقصى من الخطوات.' }
  yield { type: 'agent', agent: 'Coding', message: 'الوصول إلى الحد الأقصى من الخطوات — التوقف.', status: 'error' }
  yield { type: 'answer', content: 'تم الوصول إلى الحد الأقصى لخطوات التنفيذ. تحقق من مساحة العمل لمعرفة ما تم إنجازه.' }
}

export { runCoding, SYSTEM_PROMPT }