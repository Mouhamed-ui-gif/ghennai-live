import { useCallback, useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Rocket, X, Loader2, Volume2, VolumeX, Pencil, Sparkles, RefreshCw, Monitor, Tablet, Smartphone, Undo2, ExternalLink, Check } from 'lucide-react'
import { useApp, type EditElement, type FileNode } from '../../store/app'
import { workspace, chatStream, deploy, projects as projectsApi } from '../../api/client'
import { handleChatEvent } from '../../hooks/chatEvents'
import { speakText, voiceFor } from '../dashboard/voice'

/** حقنة في معاينة الموقع: اختيار أي عنصر بالنقر وتعديله حرفيًّا عبر Ghennai */
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

const KIND_COLOR: Record<string, string> = {
  cmd: 'text-slate-200',
  ok: 'text-emerald-400',
  info: 'text-cyan-300',
  err: 'text-rose-400',
  edit: 'text-violet-300',
  notice: 'text-amber-300',
}

function findIndexBase(tree: FileNode[], prefix = ''): string | null {
  for (const n of tree) {
    if (n.type === 'file' && /^index\.html?$/.test(n.name) && prefix) return prefix
  }
  for (const d of tree.filter((x) => x.type === 'dir')) {
    const r = findIndexBase(d.children || [], d.path)
    if (r) return r
  }
  return null
}
function firstDir(tree: FileNode[]): string | null {
  const d = tree.find((x) => x.type === 'dir' && x.name !== 'uploads')
  return d ? d.path : null
}
function mimeFor(path: string) {
  const e = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
    json: 'application/json', svg: 'image/svg+xml', txt: 'text/plain', md: 'text/markdown', png: 'image/png',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  }
  return map[e] || 'text/plain'
}
function rewriteHtml(html: string, map: Map<string, string>, norm: (p: string) => string) {
  let out = html
  out = out.replace(/(src|href)\s*=\s*["']([^"']+)["']/gi, (_all, attr: string, ref: string) => {
    if (ref.startsWith('http') || ref.startsWith('data:') || ref.startsWith('blob:') || ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('tel:')) return _all
    const key = norm(ref.replace(/^\.?\//, '').split('?')[0])
    const blob = map.get(key)
    if (blob) return `${attr}="${blob}"`
    if (/\.(css|js|mjs)$/i.test(key)) return ''
    return _all
  })
  out = out.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (all, ref: string) => {
    if (ref.startsWith('data:') || ref.startsWith('blob:') || ref.startsWith('http')) return all
    const key = norm(ref.replace(/^\.?\//, '').split('?')[0])
    const blob = map.get(key)
    return blob ? `url("${blob}")` : all
  })
  return out
}

const dirOf = (p: string) => (p.includes('/') ? p.split('/').slice(0, -1).join('/') || '.' : '.')
const extLang = (p: string) => (p.endsWith('.css') ? 'css' : p.endsWith('.js') || p.endsWith('.mjs') ? 'javascript' : 'html')
const escapeRE = (s: string) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const normP = (p: string) => p.replace(/^[\/\\]+/, '').split('?')[0]

export function CodingMode() {
  const shot = useApp((s) => s.codingShot)
  const codingVoice = useApp((s) => s.codingVoice)
  const codeFiles = useApp((s) => s.codeFiles)
  const activeCodeFile = useApp((s) => s.activeCodeFile)
  const codeFileContent = useApp((s) => s.codeFileContent)
  const editTarget = useApp((s) => s.editTarget)
  const editBusy = useApp((s) => s.editBusy)
  const editPend = useApp((s) => s.editPend)
  const variant = useApp((s) => s.previewVariant)
  const previewDevice = useApp((s) => s.previewDevice)
  const activeProject = useApp((s) => s.activeProject)

  const [doc, setDoc] = useState<string | null>(null)
  const [pdStatus, setPdStatus] = useState('جارٍ بناء المعاينة…')
  const [pdLoading, setPdLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [editText, setEditText] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishingGh, setPublishingGh] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const blobsRef = useRef<string[]>([])
  const logRef = useRef<HTMLDivElement | null>(null)
  const typingScrollRef = useRef<HTMLDivElement | null>(null)
  const docsRef = useRef<Map<string, string>>(new Map())
  const liveRef = useRef<{ files: { rel: string; content: string }[]; base: string | null }>({ files: [], base: null })
  const typedEditorRef = useRef<{ getEditor: () => unknown; getValue: () => string } | null>(null)

  const locateElement = (el: EditElement): { file: string; line: number | null } => {
    let content: string | null = docsRef.current.get('index.html') ?? null
    if (!content) {
      const hit = [...docsRef.current.entries()].find(([k]) => k.endsWith('index.html'))
      content = hit ? hit[1] : null
    }
    const file = content ? (Object.keys(Object.fromEntries(docsRef.current)).find((k) => docsRef.current.get(k) === content) || 'index.html') : 'index.html'
    if (!content || !el) return { file, line: null }
    const needles: RegExp[] = []
    if (el.id) needles.push(new RegExp(`id=["']${escapeRE(el.id)}["']`))
    if (el.className) needles.push(new RegExp(`class=["'][^"']*\\b${escapeRE(String(el.className).split(' ')[0])}\\b`, 'i'))
    const txt = (el.text || '').replace(/\s+/g, ' ').trim().slice(0, 30)
    if (txt) needles.push(new RegExp(`>\\s*${escapeRE(txt)}`, 'i'))
    if (el.tag) needles.push(new RegExp(`<${el.tag}\\b`, 'i'))
    const lines = content.split('\n')
    if (el.id) {
      for (let i = 0; i < lines.length; i++) if (needles[0].test(lines[i])) return { file, line: i + 1 }
    }
    for (let i = 0; i < lines.length; i++) {
      for (const n of needles) if (n.test(lines[i])) return { file, line: i + 1 }
    }
    return { file, line: null }
  }

  /** يُرسم المعاينة من قائمة ملفات في الذاكرة (الوصول الخلفي أو الحي) */
  const applyDoc = useCallback((files: { rel: string; content: string }[], base: string | null, quiet = false) => {
    liveRef.current = { files, base }
    const newBlobs: string[] = []
    for (const f of files) {
      newBlobs.push(URL.createObjectURL(new Blob([f.content], { type: mimeFor(f.rel) })))
      if (/\.(html?)$/.test(f.rel)) docsRef.current.set(f.rel, f.content)
    }
    const map = new Map(files.map((f, i) => [normP(f.rel), newBlobs[i]]))
    const idx = files.find((f) => /^index\.html?$/.test(normP(f.rel))) || files.find((f) => /\/index\.html?$/.test(normP(f.rel)))
    if (idx) {
      const dir = idx.rel.replace(/[^/]*$/, '')
      const resolveRel = (p: string) => (p.startsWith('/') ? normP(p) : normP(dir + p))
      const html = rewriteHtml(idx.content, map, resolveRel)
      const inject = html.replace(/<\/body>/i, (m) => EDIT_PROBE + '\n' + m)
      setDoc(inject === html ? html + EDIT_PROBE : inject)
      if (!quiet) setPdStatus(`عرض «${base || 'مساحة العمل'}» — ${files.length} ملف`)
    } else {
      if (!quiet) {
        setDoc(null)
        setPdStatus('لا يزال الوكيل يكتب index.html…')
      }
    }
    blobsRef.current.forEach((u) => URL.revokeObjectURL(u))
    blobsRef.current = newBlobs
  }, [])

  const build = useCallback(async () => {
    setPdLoading(true)
    try {
      const { tree: fullTree } = await workspace.tree()
      const prjFolder = useApp.getState().codingProjectFolder
      let base: string | null = null
      if (prjFolder && prjFolder !== '.' && prjFolder !== '') {
        base = prjFolder
      } else {
        const rootHasIndex = fullTree.some((n: FileNode) => n.type === 'file' && /^index\.html?$/.test(n.name))
        base = rootHasIndex ? null : findIndexBase(fullTree) || firstDir(fullTree) || null
      }
      const { tree: sub } = base ? await workspace.tree(base) : { tree: fullTree }
      const files: { rel: string; content: string }[] = []
      const walk = async (list: FileNode[], _prefix = '') => {
        for (const f of list) {
          if (f.type === 'dir') await walk(f.children || [], f.rel || f.path)
          else {
            if (/node_modules|\.git|dist[\\/]/.test(f.path)) continue
            try {
              const d = await workspace.read(f.path)
              if (typeof d.content === 'string' && d.content.length <= 300000) files.push({ rel: f.rel || f.path, content: d.content })
            } catch { /* noop */ }
          }
        }
      }
      await walk(sub as FileNode[])
      applyDoc(files, base)
    } catch {
      setDoc(null)
      setPdStatus('لا يزال البناء جاريًا…')
    } finally {
      setPdLoading(false)
    }
  }, [applyDoc])

  useEffect(() => {
    const id = setTimeout(build, 300)
    return () => {
      clearTimeout(id)
      blobsRef.current.forEach((u) => URL.revokeObjectURL(u))
      blobsRef.current = []
    }
  }, [build, variant])

  /** المعاينة الحية: نرسم مباشرة من liveFiles دون انتظار الحفظ على القرص */
  const liveFiles = useApp((s) => s.liveFiles)
  useEffect(() => {
    if (!shot || !Object.keys(liveFiles).length) return
    const id = setTimeout(() => {
      const entries = Object.entries(liveFiles).filter(([, c]) => c.length > 0)
      if (!entries.length) return
      const baseFiles = liveRef.current?.files?.slice() ?? []
      for (const [rel, content] of entries) {
        const i = baseFiles.findIndex((f) => f.rel === rel)
        if (i >= 0) baseFiles[i] = { rel, content }
        else baseFiles.push({ rel, content })
      }
      applyDoc(baseFiles, liveRef.current?.base ?? null, true)
    }, 150)
    return () => clearTimeout(id)
  }, [liveFiles, applyDoc])

  useEffect(() => {
    if (!activeCodeFile) {
      useApp.getState().setCodeFileContent(null)
      return
    }
    workspace
      .read(activeCodeFile)
      .then((d) => useApp.getState().setCodeFileContent((d as { content?: string }).content ?? ''))
      .catch(() => undefined)
  }, [activeCodeFile, codeFiles.length, shot?.typed?.file, shot?.done, shot?.built])

  useEffect(() => {
    const frame = iframeRef.current
    if (frame?.contentWindow) frame.contentWindow.postMessage({ source: 'ghn-preview', type: 'edit-mode', on: picking }, '*')
  }, [picking])

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { source?: string; type?: string; el?: EditElement }
      if (!d || d.source !== 'ghn-preview' || d.type !== 'pick' || !d.el) return
      const loc = locateElement(d.el)
      useApp.getState().setEditTarget({ ...d.el, file: loc.file, line: loc.line })
      setPicking(false)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  useEffect(() => {
    if (!(shot?.typed?.text && shot.typed.file === activeCodeFile)) return
    const inst = typedEditorRef.current?.getEditor?.() as { revealLine?: (l: number, s: number) => void; getModel?: () => { getLineCount?: () => number } | null } | null
    const model = inst?.getModel?.()
    const last = (model?.getLineCount?.() ?? 1) || 1
    inst?.revealLine?.(last, 3)
  }, [shot?.typed?.text, shot?.typed?.file, activeCodeFile])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [shot?.actions.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        useApp.getState().exitCodingMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const runEditRequest = (payload: { message: string; agent: string; edit: Record<string, unknown> }) => {
    const st = useApp.getState()
    st.setEditBusy(true)
    st.setBusy(true)
    chatStream(
      payload,
      (e) => handleChatEvent(e),
      () => {
        st.setEditBusy(false)
        st.setBusy(false)
        setTimeout(() => st.setBusy(false), 1200)
        setTimeout(() => {
          if (!useApp.getState().editPend && !useApp.getState().editBusy) st.setEditTarget(null)
        }, 600)
      }
    )
  }

  /** الخطوة الأولى للتعديل: الوكيل يحضّر اقتراحًا فقط (لا يعدّل حتى يوافق المستخدم) */
  const submitEdit = () => {
    const st = useApp.getState()
    const el = st.editTarget
    const text = editText.trim()
    if (!el || !text || st.editBusy) return
    const label = el.text ? `«${el.text.slice(0, 40)}»` : `<${el.tag}>`
    st.addUserMsg(`✂️ ${label} ← ${text}`)
    st.pushCodeAction({ kind: 'edit', text: `✂️ ${label}: ${text}` })
    const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en'
    if (st.codingVoice) speakText('حسنًا، دعني أعرضُ عليك اقتراحًا قبل التعديل', lang, undefined, voiceFor('Coding'))
    setEditText('')
    const root = el.file ? dirOf(el.file) : st.codingProjectFolder || null
    runEditRequest({ message: text, agent: 'Coding', edit: { element: el, root, propose: true } })
  }

  /** الخطوة الثانية: المستخدم وافق — يُطبَّق التعديل الجراحي */
  const applyEdit = () => {
    const st = useApp.getState()
    const pend = st.editPend
    if (!pend || st.editBusy) return
    st.addUserMsg(`✅ ${pend.request}`)
    st.pushCodeAction({ kind: 'edit', text: `✅ وافق المستخدم — تطبيق: ${pend.request.slice(0, 120)}` })
    if (st.codingVoice) speakText('ممتاز، وافقْتَ — سأطبّقُ التعديلَ الآن', document.documentElement.lang === 'ar' ? 'ar' : 'en', undefined, voiceFor('Coding'))
    const payload = {
      message: pend.request,
      agent: 'Coding',
      edit: { element: pend.element ?? null, root: pend.root ?? null, propose: false },
    }
    runEditRequest(payload)
  }

  const cancelEdit = () => {
    const st = useApp.getState()
    st.setEditPend(null)
    st.setEditTarget(null)
    st.pushCodeAction({ kind: 'info', text: '⏹ أُلغيت الموافقة — لم يحدث أي تعديل' })
  }

  const publish = async () => {
    if (publishing) return
    setPublishing(true)
    const st = useApp.getState()
    let site = '.'
    for (const f of st.codeFiles) {
      if (f.path === 'index.html' || f.path.endsWith('/index.html')) {
        site = dirOf(f.path)
        break
      }
    }
    if (st.codingVoice) speakText('أُنشِرُ الموقعَ الآن على رابط فوري', document.documentElement.lang === 'ar' ? 'ar' : 'en', undefined, voiceFor('Coding'))
    st.pushCodeAction({ kind: 'info', text: '🚀 تجهيز الرابط الفوري…' })
    st.pushToast({ kind: 'info', title: 'رابط فوري', message: 'يُحضّر رابط موقعك…' })
    try {
      const d = await deploy.run(site, 'instant')
      const url = (d as { url?: string }).url
      st.pushCodeAction({ kind: 'ok', text: `رابطك الفوري جاهز: ${url}` })
      st.pushToast({ kind: 'success', title: 'الرابط جاهز!', message: url || '' })
      st.setDeployState('done', url, null)
      if (st.codingVoice) speakText('تمّ — رابطُك الفوريُّ جاهز', document.documentElement.lang === 'ar' ? 'ar' : 'en', undefined, voiceFor('Coding'))
    } catch (err) {
      st.pushCodeAction({ kind: 'err', text: `فشل إنشاء الرابط: ${String((err as Error).message).slice(0, 120)}` })
      st.pushToast({ kind: 'error', title: 'فشل', message: String((err as Error).message).slice(0, 140) })
    } finally {
      setPublishing(false)
    }
  }

  const publishGitHub = async () => {
    if (publishingGh) return
    setPublishingGh(true)
    const st = useApp.getState()
    let site = '.'
    for (const f of st.codeFiles) {
      if (f.path === 'index.html' || f.path.endsWith('/index.html')) {
        site = dirOf(f.path)
        break
      }
    }
    st.pushCodeAction({ kind: 'info', text: '🚀 جارٍ النشر الدائم على GitHub… (يتطلب التوكن)' })
    st.pushToast({ kind: 'info', title: 'نشر دائم', message: 'يُنشر على GitHub Pages… قد يستغرق دقيقة' })
    try {
      const d = await deploy.run(site, 'github')
      const url = (d as { url?: string }).url
      if (url) {
        st.setDeployState('done', url, null)
        st.pushCodeAction({ kind: 'ok', text: `نُشر على رابط دائم: ${url}` })
        st.pushToast({ kind: 'success', title: 'تم النشر الدائم!', message: url })
      } else {
        const err = (d as { error?: string }).error
        st.pushCodeAction({ kind: 'err', text: `النشر الدائم: ${(err || 'راجع إعدادات GitHub').slice(0, 120)}` })
        st.pushToast({ kind: 'error', title: 'لم يُنشر', message: (err || 'أضف توكن GitHub لاستخدام الرابط الدائم').slice(0, 140) })
      }
    } catch (err) {
      st.pushToast({ kind: 'error', title: 'فشل النشر الدائم', message: String((err as Error).message).slice(0, 140) })
    } finally {
      setPublishingGh(false)
    }
  }

  const undoRollback = async () => {
    const prj = useApp.getState().activeProject
    if (!prj || (prj.version || 0) <= 1) return
    try {
      await projectsApi.rollback(prj.id, (prj.version || 1) - 1)
      useApp.getState().pushCodeAction({ kind: 'info', text: `↩ استرجاع الإصدار v${(prj.version || 1) - 1}` })
      useApp.getState().pushToast({ kind: 'info', title: 'استرجاع', message: `جارٍ استرجاع الإصدار v${(prj.version || 1) - 1}…` })
    } catch (err) {
      useApp.getState().pushToast({ kind: 'error', title: 'فشل الاسترجاع', message: String((err as Error).message).slice(0, 120) })
    }
  }

  if (!shot) return null

  const typing: { file: string | null; text: string } | null = shot.typed
  const typingHere = typing && typing.file === activeCodeFile && !!typing.text
  const elDesc = editTarget
    ? [editTarget.tag, editTarget.id && `#${editTarget.id}`, editTarget.className && `.${editTarget.className}`].filter(Boolean).join('') || '<' + editTarget.tag + '>'
    : ''

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-night-950 text-slate-200">
      {/* الشريط العلوي */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-night-900/90 px-3 py-2 backdrop-blur">
        <span className="flex items-center gap-1 rounded-lg bg-cyan-500/10 px-2 py-1 text-[11px] font-bold text-cyan-300">
          <Sparkles size={13} /> وضع البرمجة
        </span>
        <span className="text-sm font-semibold text-white">{shot.project}</span>
        <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${shot.mode === 'edit' ? 'bg-violet-500/15 text-violet-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
          {shot.mode === 'edit' ? '✂️ تعديل' : '⠦ بناء'}
        </span>
        <span className="flex items-center gap-1 text-[11px]">
          {shot.running ? (
            <span className="text-cyan-300">
              <Loader2 size={11} className="mr-1 inline animate-spin" /> يعمل الآن…
            </span>
          ) : shot.error ? (
            <span className="text-rose-400">⚠ خطأ</span>
          ) : (
            <span className="text-emerald-400">● اكتمل ✓</span>
          )}
        </span>

        <div className="ms-auto flex items-center gap-1.5">
          <button
            onClick={() => useApp.getState().setCodingVoice(!codingVoice)}
            title={codingVoice ? 'كتم إعلانات الصوت' : 'تشغيل إعلانات الصوت'}
            className={`rounded-lg p-1.5 transition hover:bg-white/10 ${codingVoice ? 'text-cyan-300' : 'text-slate-600'}`}
          >
            {codingVoice ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button
            onClick={() => setPicking((p) => !p)}
            title="انقر على عنصر في الموقع لتعديله حرفيًا"
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition ${
              picking ? 'bg-cyan-500 text-night-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Pencil size={14} /> اختيار عنصر
          </button>
          <button
            onClick={publish}
            disabled={publishing || shot.running}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-2.5 py-1.5 text-[12px] font-semibold text-night-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />} رابط فوري
          </button>
          <button
            onClick={publishGitHub}
            disabled={publishingGh || shot.running}
            title="نشر دائم على GitHub Pages (يتطلب توكن GitHub)"
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-[12px] text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            {publishingGh ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />} دائم GitHub
          </button>
          {activeProject && (activeProject.version || 0) > 0 && (
            <span className="flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300">
              v{activeProject.version}
              <button
                onClick={undoRollback}
                disabled={(activeProject.version || 0) <= 1}
                title="التراجع إلى النسخة السابقة"
                className="rounded p-0.5 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
              >
                <Undo2 size={13} />
              </button>
            </span>
          )}
          <button
            onClick={() => useApp.getState().exitCodingMode()}
            title="إنهاء والعودة للدردشة"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* الجسد: الموقع الحي (يمين) | الكود (يسار) */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-0">
        {/* الموقع الحي */}
        <div className="flex min-h-0 flex-col">

          <div className="flex items-center justify-between border-b border-white/10 bg-night-900/60 px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
              {shot.mode === 'build' && shot.live?.url ? (
                <>
                  <ExternalLink size={12} className="text-emerald-400" />
                  <span dir="ltr" className="font-mono text-emerald-300">/{shot.live.code}/ — الموقع الحي</span>
                </>
              ) : (
                <>
                  {pdLoading && <Loader2 size={12} className="animate-spin" />}
                  {pdStatus}
                </>
              )}
            </span>
            <div className="flex items-center gap-1">
              {shot.mode === 'build' && shot.live?.url && (
                <a
                  href={`${shot.live.url}?v=${variant}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
                  title="فتح الرابط في تبويب جديد"
                >
                  <ExternalLink size={13} />
                </a>
              )}
              {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => useApp.getState().setPreviewDevice(d)}
                  title={d === 'desktop' ? 'سطح المكتب' : d === 'tablet' ? 'لوحي' : 'موبايل'}
                  className={`rounded-md p-1 transition ${previewDevice === d ? 'bg-white/15 text-white' : 'text-slate-500 hover:bg-white/10 hover:text-white'}`}
                >
                  {d === 'desktop' ? <Monitor size={13} /> : d === 'tablet' ? <Tablet size={13} /> : <Smartphone size={13} />}
                </button>
              ))}
              <button onClick={() => setPicking((p) => !p)} className="rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-white" title="اختيار عنصر للتعديل">
                <Pencil size={13} />
              </button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 bg-white p-3">
            {picking && (
              <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
                <span className="rounded-full bg-cyan-500 px-3 py-1 text-[11px] font-bold text-night-950 shadow-lg">
                  👆 انقر على أي عنصر في الموقع لتعديله حرفيًّا
                </span>
              </div>
            )}
            <div className="h-full w-full overflow-hidden rounded-lg shadow-2xl" style={{ maxWidth: previewDevice === 'desktop' ? '100%' : previewDevice === 'tablet' ? '768px' : '390px', margin: 'auto' }}>
              {shot.mode === 'build' && shot.live?.url ? (
                <iframe
                  ref={iframeRef}
                  key={shot.live.code}
                  title="coding-live-site"
                  src={`${shot.live.url}?v=${variant}${picking ? '&pick=1' : ''}`}
                  className="h-full w-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              ) : (
                <iframe
                  ref={iframeRef}
                  title="coding-live-site"
                  srcDoc={doc || '<html><body></body></html>'}
                  className="h-full w-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              )}
            </div>

            {editPend && !editBusy && (
              <div className="absolute inset-x-3 bottom-3 z-30 mx-auto max-w-lg rounded-xl border border-emerald-400/30 bg-night-900/95 p-3 shadow-2xl backdrop-blur">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate text-[11px] font-bold text-emerald-300">
                    <Sparkles size={13} className="shrink-0" /> اقتراح التعديل — هل توافق على تطبيقه؟
                  </span>
                  <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300" dir="ltr">
                    {editPend.element ? (editPend.element.id ? `#${editPend.element.id}` : '<' + editPend.element.tag + '>') : editPend.root || '.'}
                  </span>
                </div>
                <p className="mb-3 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg bg-night-950/70 p-2.5 text-[12px] leading-relaxed text-slate-300">
                  {editPend.summary}
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-slate-300 transition hover:bg-white/10"
                  >
                    <X size={13} /> لا، لا تعدّل
                  </button>
                  <button
                    onClick={applyEdit}
                    className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-night-950 transition hover:bg-emerald-400"
                  >
                    <Check size={14} /> نعم، نفّذ التعديل
                  </button>
                </div>
              </div>
            )}
            {editTarget && !editPend && (
              <div className="absolute inset-x-3 bottom-3 mx-auto max-w-lg rounded-xl border border-violet-400/30 bg-night-900/95 p-3 shadow-2xl backdrop-blur">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 truncate font-mono text-[11px] text-violet-300" dir="ltr">
                    <Pencil size={13} className="shrink-0" />
                    {elDesc}
                  </span>
                  {editTarget.file && (
                    <span className="truncate rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300" dir="ltr" title="المصدر الحقيقي في المشروع">
                      📄 {editTarget.file}
                      {editTarget.line ? `:${editTarget.line}` : ''}
                    </span>
                  )}
                  {editTarget.text && <span className="truncate text-[10px] text-slate-500">{editTarget.text.slice(0, 40)}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEdit()
                    }}
                    placeholder="ماذا تريد أن يغيّر Ghennai في هذا العنصر؟"
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-night-950 px-3 py-2 text-[12px] text-white placeholder:text-slate-600 focus:border-violet-400 focus:outline-none"
                  />
                  <button
                    onClick={submitEdit}
                    disabled={editBusy}
                    className="flex items-center gap-1 rounded-lg bg-violet-500 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                  >
                    {editBusy ? <Loader2 size={14} className="animate-spin" /> : <Pencil size={14} />} عدّل
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* الكود */}
        <div className="flex min-h-0 flex-col border-s border-white/5">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-night-900/60 px-2 py-1.5">
            {codeFiles.length === 0 && <span className="px-2 text-[11px] text-slate-500">بانتظار أن يبدأ الوكيل الكتابة…</span>}
            {codeFiles.map((f) => (
              <button
                key={f.path}
                onClick={() => useApp.getState().setActiveCodeFile(f.path)}
                className={`shrink-0 rounded-md px-2 py-1 font-mono text-[11px] transition ${
                  activeCodeFile === f.path ? 'bg-cyan-500/15 text-cyan-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {f.path.split('/').pop()}
              </button>
            ))}
            <button onClick={build} title="تحديث المعاينة" className="ms-auto shrink-0 rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-white">
              <RefreshCw size={13} />
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            {typing && typing.file !== activeCodeFile && typing.file && (
              <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 border-b border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-[11px] text-cyan-300">
                <Loader2 size={12} className="animate-spin" /> يكتب {typing.file} الآن…{' '}
                {typing.text.length > 0 && <span className="text-slate-400">({typing.text.length} حرفًا)</span>}
              </div>
            )}
            <div className="h-full">
              {!activeCodeFile && !typingHere ? (
                <div className="flex h-full items-center justify-center text-[12px] text-slate-600 select-none">
                  {shot.running ? 'جارٍ بناء الموقع… ستظهر الملفات هنا مباشرة' : 'بانتظار أن يبدأ الوكيل الكتابة…'}
                </div>
              ) : (
                <div ref={typingScrollRef} className="h-full">
                  <Editor
                    onMount={(ed) => {
                      typedEditorRef.current = { getEditor: () => ed, getValue: () => ed.getValue() }
                    }}
                    language={extLang(activeCodeFile || '')}
                    theme="vs-dark"
                    value={typingHere ? typing!.text : (codeFileContent ?? '')}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13.5,
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      lineNumbers: 'on',
                      smoothScrolling: true,
                      cursorBlinking: typingHere ? 'phase' : 'blink',
                      cursorStyle: 'line',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* حالة حالة المشروع والنشر */}
      {activeProject && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 bg-night-900/80 px-4 py-1.5 text-[11px] text-slate-400">
          <span className="font-semibold text-white">{activeProject.name}</span>
          <span className="font-mono text-[10px] text-slate-600" dir="ltr">{activeProject.id}</span>
          <span>
            المستودع: {activeProject.repo ? <span className="font-mono text-cyan-300" dir="ltr">{activeProject.repo}</span> : <span className="text-slate-600">—</span>}
          </span>
          <span className="flex items-center gap-1">
            الحالة:{' '}
            {activeProject.status === 'live' ? (
              <span className="font-bold text-emerald-400">LIVE ✓</span>
            ) : (
              <span className="text-amber-300">مسودة</span>
            )}
          </span>
          <span>الإصدار: <b className="text-white">v{activeProject.version || 0}</b></span>
          {activeProject.lastPublish && (
            <span>آخر نشر: {new Date(activeProject.lastPublish).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })}</span>
          )}
          {activeProject.url && (
            <span className="flex items-center gap-1.5">
              <a
                href={activeProject.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-emerald-500/90 px-2.5 py-1 text-[11px] font-bold text-night-950 underline-offset-2 transition hover:bg-emerald-400"
                dir="ltr"
              >
                <ExternalLink size={12} /> افتح موقعي
              </a>
              <span className="font-mono text-[10px] text-emerald-400/80" dir="ltr" title={activeProject.url}>
                {activeProject.url.replace(/^https?:\/\//, '')}
              </span>
            </span>
          )}
        </div>
      )}

      {/* سجل الأوامر */}
      <div className="flex h-36 shrink-0 flex-col border-t border-white/10 bg-night-900/70">
        <div className="flex items-center justify-between border-b border-white/5 px-3 py-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">سجل التنفيذ الحيّ</span>
          <span className="text-[10px] text-slate-600">{shot.actions.length} أمر</span>
        </div>
        <div ref={logRef} className="min-h-0 flex-1 overflow-auto px-3 py-1.5">
          {shot.actions.length === 0 && <p className="pt-2 text-[11px] text-slate-600">سترى هنا كل أمر ينفّذه الوكيل لحظةً بلحظة…</p>}
          {shot.actions.map((a) => (
            <div key={a.id} className={`flex items-start gap-2 py-0.5 font-mono text-[11.5px] ${KIND_COLOR[a.kind] || 'text-slate-300'}`} dir="ltr">
              <span className="mt-0.5 shrink-0 opacity-40">{new Date(a.ts).toLocaleTimeString('ar-EG', { hour12: false })}</span>
              <span className="min-w-0 break-all whitespace-pre-wrap">{a.text}</span>
            </div>
          ))}
        </div>
        {shot.running && (
          <div className="h-0.5 w-full overflow-hidden bg-white/5">
            <div className="h-full w-1/3 animate-pulse bg-gradient-to-r from-cyan-400 to-emerald-400" />
          </div>
        )}
      </div>
    </div>
  )
}