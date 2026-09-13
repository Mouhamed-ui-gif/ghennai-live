import fs from 'fs'
import os from 'os'
import path from 'path'
import { exec } from 'child_process'
import { userWorkspace, safeResolve } from './paths.js'
import { emitUser } from './events.js'
import { audit } from './auditLog.js'
import { User } from './db.js'
import { ensureProject, setProjectMeta, snapshotProject } from './projects.js'

const GITHUB_API = 'https://api.github.com'

function run(cmd, cwd) {
  return new Promise((resolve) => exec(cmd, { cwd, timeout: 180000, maxBuffer: 1024 * 1024 * 8 }, (err, stdout, stderr) =>
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

export function slugify(s) {
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

export async function ghAvailable() {
  try {
    const { code } = await run('gh auth status', process.cwd())
    return code === 0
  } catch {
    return false
  }
}

export const dirnameOf = (p) => {
  const i = String(p).lastIndexOf('/')
  return i > 0 ? String(p).slice(0, i) : '.'
}

export const DENY_FOR_PUBLISH = new Set(['.git', '.ghennai', '_ghennai', 'uploads', 'node_modules', 'dist', 'light-assets', 'assets_old', 'sites', 'light-site', 'README.md', 'config.json', '.gitignore'])

/** مجلد الموقع: يتّبع المجلد المطلوب صراحةً ('.' = الجذر، أو مجلد مشروع) ولا يخمّن بأحدث mtime */
export async function findSiteDir(ws, preferred) {
  const req = String(preferred || '')
  if (req && req !== '.' && req !== '~') {
    const clean = req.replace(/^~\/?/, '')
    try {
      const p = safeResolve(ws, clean)
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
    } catch {}
    try {
      const p = safeResolve(ws, clean)
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const d = safeResolve(ws, dirnameOf(clean))
        if (fs.existsSync(d)) return d
      }
    } catch {}
  }
  const rootIdx = path.join(ws, 'index.html')
  if (fs.existsSync(rootIdx)) return ws
  let best = ws
  let bestT = 0
  try {
    for (const e of fs.readdirSync(ws, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      if (DENY_FOR_PUBLISH.has(e.name)) continue
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

/** يحضّر صورة نظيفة للنشر: فقط ملفات الموقع (index.html + الأصول المحلية)، دون بيانات النظام */
export function buildStaging(siteDir) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ghn-deploy-'))
  const out = []
  const isDenied = (name) => DENY_FOR_PUBLISH.has(name)
  const walk = (dir, rel) => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (isDenied(e.name) || e.name.startsWith('.git')) continue
      const src = path.join(dir, e.name)
      const dstRel = rel ? `${rel}/${e.name}` : e.name
      const dst = path.join(stage, dstRel)
      if (e.isDirectory()) {
        walk(src, dstRel)
      } else {
        try {
          const st = fs.statSync(src)
          if (st.size > 2 * 1024 * 1024) continue
          fs.mkdirSync(path.dirname(dst), { recursive: true })
          fs.copyFileSync(src, dst)
          out.push(dstRel)
        } catch {}
      }
    }
  }
  walk(siteDir, '')
  return { stage, files: out }
}

async function resolveOwner(token, allowCli = true) {
  if (token) {
    const r = await fetch(`${GITHUB_API}/user`, { headers: { Authorization: `token ${token}`, 'User-Agent': 'ghennai' } })
    if (!r.ok) throw new Error('توكن GitHub غير صالح — تحقق من الإعدادات')
    return (await r.json()).login
  }
  if (allowCli && (await ghAvailable())) {
    const o = (await run('gh api user --jq .login 2>/dev/null || true', process.cwd())).out.trim()
    return o || null
  }
  return null
}

/**
 * نشر موقع على GitHub Pages برابط دائم خاص به.
 * @param {object} opts
 * @param {string} opts.email
 * @param {string} opts.name
 * @param {string} [opts.folder]  المجلد الصريح للموقع ('.' = الجذر، أو مجلد مشروع مثل sites/coffee)
 * @param {boolean} [opts.allowCli] السماح بالدفع عبر gh CLI عند غياب توكن المستخدم
 * @returns {Promise<{ok:boolean,published?:boolean,url?:string|null,repo?:string|null,repoUrl?:string|null,project?:object|null,error?:string,missingToken?:boolean,root?:string|null}>}
 */
export async function publishSite({ email, name, folder = '.', allowCli = true }) {
  const ws = userWorkspace(email)
  const displayName = String(name || email?.split('@')[0] || 'user')
  const host = String(email).split('@')[0]?.replace(/[^a-zA-Z0-9_\-]/g, '') || 'user'

  try {
    const siteDir = await findSiteDir(ws, folder)
    const rootRel = path.relative(ws, siteDir) || ''
    emit(email, 'init', `موقع: ${rootRel || '.'}`)

    if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
      throw new Error(`مجلد الموقع «${rootRel || '.'}» لا يحوي index.html — أكمل البناء أولاً.`)
    }

    const { stage: stageDir, files: stagedFiles } = buildStaging(siteDir)
    emit(email, 'init', `نشر نظيف: ${stagedFiles.length} ملف (بلا بيانات النظام)`)

    const gitInit = await run(`git init -b main && git add -A && git -c user.email="${host}@ghennai.local" -c user.name="${displayName}" commit -m "Generated by Ghennai" --allow-empty`, stageDir)
    if (gitInit.code !== 0 && !gitInit.err.includes('nothing to commit')) {
      emit(email, 'init', `git init: ${gitInit.err.trim().slice(0, 120)}`)
    } else {
      emit(email, 'init', 'تم تهيئة git والالتزام محليًا ✓')
    }

    const token = User.getSetting(email, 'github_token') || process.env.GITHUB_TOKEN || ''
    let owner = null
    try {
      owner = await resolveOwner(token, allowCli)
    } catch (e) {
      owner = null
      emit(email, 'gh', String(e.message || e))
    }
    if (!owner && !allowCli) {
      emit(email, 'gh', 'لا يوجد توكن GitHub خاص — لن يُنشر تلقائيًا حتى تضيف توكنك')
      audit({ user: email, agent: 'deploy', action: 'publish', result: 'missing token (auto)', status: 'skipped' })
      return {
        ok: false, published: false, missingToken: true, root: rootRel,
        error: 'أضف توكن GitHub في الإعدادات (كل مستخدم ينشر على حسابه)، ثم انقر «نشر الرابط الدائم».',
        url: null, repo: null, repoUrl: null, project: null,
      }
    }
    if (!owner) {
      emit(email, 'gh', 'لا يوجد توكن GitHub ولا gh — اعرض التعليمات…')
      audit({ user: email, agent: 'deploy', action: 'publish', result: 'missing credentials', status: 'error' })
      return {
        ok: false, published: false, missingToken: true, root: rootRel,
        error: 'لا يوجد توكن GitHub. افتح الإعدادات وأضف GITHUB_TOKEN (مجاني)، أو سجّل دخول gh CLI.',
        url: null, repo: null, repoUrl: null, project: null,
      }
    }

    const isRootSite = rootRel === ''
    const rootRemote = await existingOwnedRemote(ws, owner)
    let repoName = ''
    if (isRootSite) {
      repoName = rootRemote ? rootRemote.repo : slugify(`${owner}-site`)
    } else {
      const held = ensureProject(email, rootRel, path.basename(siteDir) || 'الموقع الرئيسي')
      const persistedRepo = held?.repo && held.repo !== rootRemote?.repo ? held.repo : null
      repoName = persistedRepo || (slugify(path.basename(siteDir)) || `site-${Date.now().toString(36).slice(-5)}`)
    }
    const url = `https://github.com/${owner}/${repoName}`
    const pagesUrl = `https://${owner}.github.io/${repoName}/`

    const pushWith = async (creds) => {
      const remote = creds
        ? `https://x-access-token:${creds}@github.com/${owner}/${repoName}.git`
        : `https://github.com/${owner}/${repoName}.git`
      return run(`git remote remove origin 2>/dev/null; git remote add origin ${remote} && git push -u origin main --force && git remote set-url origin https://github.com/${owner}/${repoName}.git`, stageDir)
    }

    if (token) {
      emit(email, 'gh', 'الاتصال بـ GitHub…')
      const exists = await fetch(`${GITHUB_API}/repos/${owner}/${repoName}`, { headers: { Authorization: `token ${token}`, 'User-Agent': 'ghennai' } })
      if (exists.ok) {
        emit(email, 'gh', `تحديث المستودع «${repoName}» — رابطك الدائم يبقى كما هو ✓`)
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
    } else {
      emit(email, 'gh', 'الدفع عبر GitHub CLI…')
      const exists = (await run(`gh api repos/${owner}/${repoName} --jq .id 2>/dev/null || true`, stageDir)).out.trim()
      if (!exists) {
        const mk = await run(`gh repo create ${owner}/${repoName} --public --source=. --push`, stageDir)
        if (mk.code !== 0 && !/already (exists|taken)/i.test(mk.err + mk.out)) throw new Error(`gh فشل: ${mk.err.trim().slice(0, 180)}`)
        emit(email, 'gh', `تم إنشاء المستودع «${repoName}» — رابطك الدائم يبقى ✓`)
      } else {
        emit(email, 'gh', `تحديث المستودع «${repoName}» — رابطك الدائم يبقى كما هو ✓`)
        const ghTok = (await run('gh auth token 2>/dev/null || true', stageDir)).out.trim()
        const p = ghTok ? await pushWith(ghTok) : await run(`git remote remove origin 2>/dev/null; gh repo set-default ${owner}/${repoName} 2>/dev/null; git push -u origin main --force`, stageDir)
        if (p.code !== 0) throw new Error(`فشل الدفع: ${p.err.trim().slice(0, 180)}`)
      }
    }

    const readme = path.join(stageDir, 'README.md')
    if (!fs.existsSync(readme)) {
      fs.writeFileSync(readme, `# ${repoName}\n\nGenerated & deployed by **Ghennai** — your free local AI agent.\n\n[التجربة الحية](${pagesUrl})\n\n> Private, local, open-source.\n`)
      await run(`git add -A && git -c user.email="${host}@ghennai.local" -c user.name="${displayName}" commit -m "docs: readme" --allow-empty`, stageDir)
      await run(`git remote remove origin 2>/dev/null; git remote add origin https://github.com/${owner}/${repoName}.git && git push -u origin main --force`, stageDir)
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
    let projectInfo = null
    try {
      let project = ensureProject(email, rootRel, path.basename(siteDir) || 'الموقع الرئيسي')
      const nextVersion = (project.version || 0) + 1
      const meta = {
        repo: repoName,
        repoUrl: url,
        url: liveUrl,
        pagesUrl,
        status: 'live',
        lastPublish: Date.now(),
        lastBuild: Date.now(),
        version: nextVersion,
        updatedAt: Date.now(),
      }
      try {
        snapshotProject(email, rootRel, nextVersion)
      } catch {}
      project = setProjectMeta(email, project.id, meta)
      emitUser(email, { type: 'project_state', project: { ...project, versions: [] } })
      projectInfo = { id: project.id, name: project.name, version: project.version, url: liveUrl, repo: repoName }
    } catch {
      /* غير حرج */
    }
    if (/github\.io/.test(liveUrl)) verifyLive(email, liveUrl)
    audit({ user: email, agent: 'deploy', action: 'publish', result: liveUrl, status: 'success' })
    return { ok: true, published: true, root: rootRel, url: liveUrl, repo: repoName, repoUrl: url, project: projectInfo }
  } catch (e) {
    const msg = String(e.message || e)
    emit(email, 'error', msg)
    audit({ user: email, agent: 'deploy', action: 'publish', result: msg, status: 'error' })
    return { ok: false, published: false, root: null, url: null, repo: null, repoUrl: null, project: null, error: msg }
  }
}