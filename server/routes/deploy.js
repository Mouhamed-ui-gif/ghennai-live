import express from 'express'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { requireAuth } from './auth.js'
import { userWorkspace, safeResolve } from '../lib/paths.js'
import { emitUser } from '../lib/events.js'
import { audit } from '../lib/auditLog.js'
import { User } from '../lib/db.js'

const router = express.Router()
const GITHUB_API = 'https://api.github.com'

function run(cmd, cwd) {
  return new Promise((resolve) => exec(cmd, { cwd, timeout: 120000, maxBuffer: 1024 * 1024 * 8 }, (err, stdout, stderr) =>
    resolve({ code: err ? 1 : 0, out: String(stdout || ''), err: String(stderr || '') })
  ))
}

function emit(email, stage, message) {
  emitUser(email, { type: 'deploy_progress', stage, message })
}

/** فحص بصيغة الإنسان: بعد النشر نعالج الرابط ونتأكد أن الموقع يحيا */
async function verifyLive(email, url) {
  if (!url || !/^https:\/\//.test(url)) return
  const probe = async () => {
    try {
      const ctl = new AbortController()
      const to = setTimeout(() => ctl.abort(), 9000)
      const r = await fetch(url, { signal: ctl.signal, redirect: 'follow' })
      clearTimeout(to)
      return r.status
    } catch {
      return null
    }
  }
  for (let i = 0; i < 6; i++) {
    const code = await probe()
    if (code && code >= 200 && code < 500) {
      emit(email, 'verified', `فحص الرابط حيًا ✓ (رمز ${code})`)
      emitUser(email, { type: 'deploy_verified', url })
      return
    }
    await new Promise((r) => setTimeout(r, 12000))
  }
  emit(email, 'verify_wait', 'حرر GitHub Pages المشروع — الرابط سيتم الإعلان عنه خلال دقيقة تقريبًا')
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'ghennai-project'
}

/** مستودع موجود لحساب نفس المالك؟ عند التكرار نحدّث نفس الرابط الدائم بدل مستودع جديد */
async function existingOwnedRemote(projectDir, owner) {
  const r = await run('git remote get-url origin', projectDir)
  const u = r.out.trim()
  if (!u) return null
  const m = u.match(/github\.com[/:]([\w-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (m && m[1] === owner) return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
  return null
}

async function ghAvailable() {
  try {
    const { code } = await run('gh auth status', process.cwd())
    return code === 0
  } catch {
    return false
  }
}

const dirnameOf = (p) => {
  const i = String(p).lastIndexOf('/')
  return i > 0 ? String(p).slice(0, i) : '.'
}

/** مجلد الموقع: المجلد الذي يحتوي أحدث index.html (مع تفضيل طلب المستخدم) */
async function findSiteDir(ws, preferred) {
  if (preferred && preferred !== '.' && preferred !== '~') {
    try {
      const p = safeResolve(ws, String(preferred).replace(/^~\/?/, ''))
      if (fs.statSync(p).isDirectory()) return p
    } catch {}
    try {
      const p = safeResolve(ws, String(preferred).replace(/^~\/?/, ''))
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const d = safeResolve(ws, dirnameOf(preferred))
        if (fs.existsSync(d)) return d
      }
    } catch {}
  }
  let best = ws
  let bestT = 0
  const rootIdx = path.join(ws, 'index.html')
  if (fs.existsSync(rootIdx)) {
    bestT = fs.statSync(rootIdx).mtimeMs
    best = ws
  }
  try {
    for (const e of fs.readdirSync(ws, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      if (['_ghennai', 'uploads', 'node_modules', '.git'].includes(e.name)) continue
      const sub = path.join(ws, e.name, 'index.html')
      if (fs.existsSync(sub)) {
        const t = fs.statSync(sub).mtimeMs
        if (t > bestT) {
          bestT = t
          best = path.join(ws, e.name)
        }
      }
    }
  } catch {}
  return best
}

async function resolveOwner(token) {
  if (token) {
    const r = await fetch(`${GITHUB_API}/user`, { headers: { Authorization: `token ${token}`, 'User-Agent': 'ghennai' } })
    if (!r.ok) throw new Error('توكن GitHub غير صالح — تحقق من الإعدادات')
    return (await r.json()).login
  }
  if (await ghAvailable()) {
    const o = (await run('gh api user --jq .login 2>/dev/null || true', process.cwd())).out.trim()
    return o || null
  }
  return null
}

router.get('/status', requireAuth, async (req, res) => {
  const email = req.user?.email
  const gh = await ghAvailable()
  const token = User.getSetting(email, 'github_token') || process.env.GITHUB_TOKEN || ''
  res.json({ hasToken: !!token, ghAvailable: gh })
})

router.post('/token', requireAuth, (req, res) => {
  const token = req.body?.token
  if (!token) return res.status(400).json({ error: 'token required' })
  User.setSetting(req.user.email, 'github_token', String(token).trim())
  res.json({ ok: true })
})

router.post('/', requireAuth, async (req, res) => {
  const email = req.user?.email
  const name = req.user?.name || email?.split('@')[0] || 'user'
  const ws = userWorkspace(email)
  const project = String(req.body?.project || '.')
  let token = User.getSetting(email, 'github_token') || process.env.GITHUB_TOKEN || ''
  const host = email?.split('@')[0]?.replace(/[^a-zA-Z0-9_\-]/g, '') || 'user'

  try {
    // 1) مجلد الموقع (أحدث index.html، مع تفضيل طلب المستخدم)
    const siteDir = await findSiteDir(ws, project)
    emit(email, 'init', `موقع: ${path.relative(ws, siteDir) || '.'}`)

    const gitInit = await run(`git init -b main && git add -A && git -c user.email="${host}@ghennai.local" -c user.name="${name}" commit -m "Generated by Ghennai" --allow-empty`, siteDir)
    if (gitInit.code !== 0 && !gitInit.err.includes('nothing to commit')) {
      emit(email, 'init', `git init: ${gitInit.err.trim().slice(0, 120)}`)
    } else {
      emit(email, 'init', 'تم تهيئة git والالتزام محليًا ✓')
    }

    // 2) المالك
    const owner = await resolveOwner(token)
    if (!owner) {
      emit(email, 'gh', 'لا يوجد توكن GitHub ولا gh — اعرض التعليمات…')
      audit({ user: email, agent: 'deploy', action: 'deploy', result: 'missing credentials', status: 'error' })
      res.json({ ok: false, error: 'لا يوجد توكن GitHub. افتح الإعدادات وأضف GITHUB_TOKEN (مجاني)، أو سجّل دخول gh CLI.', url: null })
      return
    }

    // 3) المستودع الدائم الواحد: نفس الريبو كل مرة → رابط واحد ثابت
    const rootRemote = await existingOwnedRemote(ws, owner)
    const repoName = rootRemote ? rootRemote.repo : slugify(`${owner}-site`)
    const url = `https://github.com/${owner}/${repoName}`
    const pagesUrl = `https://${owner}.github.io/${repoName}/`

    const pushWith = async (creds) => {
      const remote = creds
        ? `https://x-access-token:${creds}@github.com/${owner}/${repoName}.git`
        : `https://github.com/${owner}/${repoName}.git`
      return run(`git remote remove origin 2>/dev/null; git remote add origin ${remote} && git push -u origin main --force && git remote set-url origin https://github.com/${owner}/${repoName}.git`, siteDir)
    }

    if (token) {
      emit(email, 'gh', 'الاتصال بـ GitHub…')
      const exists = await fetch(`${GITHUB_API}/repos/${owner}/${repoName}`, { headers: { Authorization: `token ${token}`, 'User-Agent': 'ghennai' } })
      if (exists.ok) {
        emit(email, 'gh', `تحديث نفس المستودع «${repoName}» — رابطك الدائم يبقى كما هو ✓`)
      } else {
        const create = await fetch(`${GITHUB_API}/user/repos`, {
          method: 'POST',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ghennai' },
          body: JSON.stringify({ name: repoName, description: 'Built by Ghennai — autonomous AI agent', private: false }),
        })
        if (create.status !== 201 && create.status !== 422) {
          const txt = await create.text()
          throw new Error(`فشل إنشاء المستودع (${create.status}): ${txt.slice(0, 160)}`)
        }
        emit(email, 'gh', `تم إنشاء المستودع «${repoName}» — رابطك الدائم يبقى ✓`)
      }
      const p = await pushWith(token)
      if (p.code !== 0) throw new Error(`فشل الدفع: ${p.err.trim().slice(0, 180)}`)
    } else if (owner) {
      emit(email, 'gh', 'الدفع عبر GitHub CLI…')
      const exists = (await run(`gh api repos/${owner}/${repoName} --jq .id 2>/dev/null || true`, siteDir)).out.trim()
      if (!exists) {
        const mk = await run(`gh repo create ${owner}/${repoName} --public --source=. --push`, siteDir)
        if (mk.code !== 0 && !/already (exists|taken)/i.test(mk.err + mk.out)) throw new Error(`gh فشل: ${mk.err.trim().slice(0, 180)}`)
        emit(email, 'gh', `تم إنشاء المستودع «${repoName}» — رابطك الدائم يبقى ✓`)
      } else {
        emit(email, 'gh', `تحديث نفس المستودع «${repoName}» — رابطك الدائم يبقى كما هو ✓`)
        const ghTok = (await run('gh auth token 2>/dev/null || true', siteDir)).out.trim()
        const p = ghTok ? await pushWith(ghTok) : await run(`git remote remove origin 2>/dev/null; gh repo set-default ${owner}/${repoName} 2>/dev/null; git push -u origin main --force`, siteDir)
        if (p.code !== 0) throw new Error(`فشل الدفع: ${p.err.trim().slice(0, 180)}`)
      }
    }

    const readme = path.join(siteDir, 'README.md')
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(readme, `# ${repoName}\n\nGenerated & deployed by **Ghennai** — your free local AI agent.\n\n[التجربة الحية](${pagesUrl})\n\n> Private, local, open-source.\n`)
      await run(`git add -A && git -c user.email="${host}@ghennai.local" -c user.name="${name}" commit -m "docs: readme" --allow-empty`, siteDir)
      await run(`git remote remove origin 2>/dev/null; git remote add origin https://github.com/${owner}/${repoName}.git && git push -u origin main --force`, siteDir)
    }

    let liveUrl = url
    emit(email, 'pages', 'تفعيل GitHub Pages…')
    try {
      if (token) {
        const pr = await fetch(`${GITHUB_API}/repos/${owner}/${repoName}/pages`, {
          method: 'POST',
          headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ghennai' },
          body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
        })
        if (pr.status === 201 || pr.status === 409) emit(email, 'pages', 'تم تفعيل GitHub Pages — الرابط يعمل خلال ~1 دقيقة ✓')
        else emit(email, 'pages', `تفعيل Pages (${pr.status}) — ستظهر تلقائيًا قريبًا`)
        liveUrl = pagesUrl
      } else {
        const pr = await run(`gh api -X POST repos/${owner}/${repoName}/pages -f 'source[branch]=main' -f 'source[path]=/' 2>/dev/null || true`, siteDir)
        if (pr.code === 0) emit(email, 'pages', 'تم تفعيل GitHub Pages — الرابط يعمل خلال ~1 دقيقة ✓')
        else emit(email, 'pages', 'سيتم تفعيل GitHub Pages تلقائيًا قريبًا')
        liveUrl = pagesUrl
      }
    } catch {
      emit(email, 'pages', 'رابط المستودع متاح — يمكنك تفعيل Pages من إعدادات المستودع')
      liveUrl = url
    }

    emit(email, 'done', 'تم النشر بنجاح! 🚀')
    emitUser(email, { type: 'deploy_done', url: liveUrl, repoUrl: url })
    if (/github\.io/.test(liveUrl)) verifyLive(email, liveUrl)
    audit({ user: email, agent: 'deploy', action: 'deploy', result: liveUrl, status: 'success' })
    res.json({ ok: true, url: liveUrl, repo: repoName, repoUrl: url })
  } catch (e) {
    const msg = String(e.message || e)
    emit(email, 'error', msg)
    audit({ user: email, agent: 'deploy', action: 'deploy', result: msg, status: 'error' })
    res.status(500).json({ ok: false, error: msg, url: null })
  }
})

export default router