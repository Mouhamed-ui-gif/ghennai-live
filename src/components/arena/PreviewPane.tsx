import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Sparkles, Loader2, ExternalLink } from 'lucide-react'
import { useApp } from '../../store/app'
import { workspace } from '../../api/client'
import type { FileNode } from '../../store/app'

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
  out = out.replace(/(src|href)\s*=\s*["']([^"']+)["']/gi, (all, attr: string, ref: string) => {
    if (ref.startsWith('http') || ref.startsWith('data:') || ref.startsWith('blob:') || ref.startsWith('#') || ref.startsWith('mailto:') || ref.startsWith('tel:')) return all
    const stripped = ref.replace(/^\.?\//, '').split('?')[0]
    const key = norm(stripped)
    const blob = map.get(key)
    if (blob) return `${attr}="${blob}"`
    if (/\.(css|js|mjs)$/i.test(stripped)) return ''
    return all
  })
  out = out.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (all, ref: string) => {
    if (ref.startsWith('data:') || ref.startsWith('blob:') || ref.startsWith('http')) return all
    const key = norm(ref.replace(/^\.?\//, '').split('?')[0])
    const blob = map.get(key)
    return blob ? `url("${blob}")` : all
  })
  return out
}

export function PreviewPane() {
  const variant = useApp((s) => s.previewVariant)
  const activeFile = useApp((s) => s.activeFile)
  const [doc, setDoc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('…')
  const blobsRef = useRef<string[]>([])

  const build = async () => {
    setLoading(true)
    let newBlobs: string[] = []
    try {
      const scope = useApp.getState().projectName && useApp.getState().projectName !== 'project' ? useApp.getState().projectName : null
      const { tree: fullTree } = scope ? await workspace.tree(scope) : await workspace.tree()
      const rootHasIndex = !scope && fullTree.some((n: FileNode) => n.type === 'file' && /^index\.html?$/.test(n.name))
      const base = scope || (rootHasIndex ? null : findIndexBase(fullTree) || firstDir(fullTree) || null)
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
      const norm = (p: string) => p.replace(/^[\/\\]+/, '').split('?')[0]
      for (const f of files) {
        const b = URL.createObjectURL(new Blob([f.content], { type: mimeFor(f.rel) }))
        newBlobs.push(b)
      }
      const map = new Map(files.map((f, i) => [norm(f.rel), newBlobs[i]]))
      const idx = files.find((f) => /^index\.html?$/.test(norm(f.rel))) || files.find((f) => /\/index\.html?$/.test(norm(f.rel)))
      if (!idx) {
        setDoc(null)
        setStatus(base ? `لا يوجد index.html في «${base}» بعد — الوكيل لا يزال يكتب…` : 'لا ملفات بعد…')
      } else {
        const dir = idx.rel.replace(/[^/]*$/, '')
        const resolveRel = (p: string) => (p.startsWith('/') ? norm(p) : norm(dir + p))
        const html = rewriteHtml(idx.content, map, resolveRel)
        setDoc(html)
        setStatus(base ? `عرض «${base}» — ${files.length} ملف` : `عرض الجذر — ${files.length} ملف`)
      }
    } catch {
      setDoc(null)
      setStatus('لا يزال البناء جاريًا…')
    } finally {
      setLoading(false)
      blobsRef.current.forEach((u) => URL.revokeObjectURL(u))
      blobsRef.current = newBlobs
    }
  }

  useEffect(() => {
    const id = setTimeout(build, 250)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, activeFile])

  return (
    <div className="flex h-full flex-col bg-night-950/50">
      <div className="flex items-center justify-between border-b border-white/10 bg-night-900/50 px-3 py-1.5">
        <span className="flex items-center gap-2 text-[12px] text-slate-400">
          <Sparkles size={13} className="text-cyan-400" />
          {status}
          {loading && <Loader2 size={12} className="animate-spin" />}
        </span>
        <button onClick={build} className="rounded-lg p-1 text-slate-400 transition hover:bg-white/10 hover:text-white" title="تحديث">
          <RotateCcw size={14} />
        </button>
      </div>
      {doc ? (
        <div className="grid min-h-0 flex-1 place-items-center bg-white p-4">
          <div className="h-full w-full overflow-hidden rounded-xl shadow-xl" style={{ transform: 'perspective(1400px) rotateX(2deg)' }}>
            <iframe title="live-preview" srcDoc={doc} className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-forms" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center text-slate-500">
          <Loader2 size={26} className={`animate-spin ${loading ? '' : 'hidden'}`} />
          <p className="max-w-sm px-4 text-sm">
            {loading ? 'بناء المعاينة الحية…' : status}
          </p>
          <span className="text-[11px] flex items-center gap-1"><ExternalLink size={11} /> المعاينة تبني نفسها تلقائيًا مع كل ملف يكتبه الوكيل</span>
        </div>
      )}
    </div>
  )
}