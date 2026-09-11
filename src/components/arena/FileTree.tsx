import { useState } from 'react'
import { ChevronDown, ChevronLeft, Download, FileCode2, File as FileIcon, FileText, Folder, FolderOpen, Trash2 } from 'lucide-react'
import { useApp } from '../../store/app'
import type { FileNode } from '../../store/app'
import { workspace } from '../../api/client'

function extIcon(name: string) {
  const e = name.split('.').pop()?.toLowerCase() || ''
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'rb'].includes(e)) return FileCode2
  return FileIcon
}

function Node({ node, depth }: { node: FileNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0 && node.type === 'dir')
  const active = useApp((s) => s.activeFile) === node.path

  const refresh = () => workspace.tree().then((d) => useApp.getState().setFiles((d as { tree: never }).tree)).catch(() => undefined)

  const delNode = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const label = node.type === 'dir' ? 'المجلد' : 'الملف'
    if (!(window.confirm(`حذف ${label} «${node.name}» نهائيًا؟`))) return
    try {
      await workspace.del(node.path)
      if (useApp.getState().activeFile === node.path) {
        useApp.getState().setActiveFile(null)
        useApp.getState().setFileContent(null)
      }
      refresh()
      useApp.getState().pushToast({ kind: 'success', message: `✓ حُذف ${node.name}` })
    } catch (err) {
      useApp.getState().pushToast({ kind: 'error', message: String((err as Error).message || err) })
    }
  }

  const dlNode = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (node.type !== 'file') return
    try {
      await workspace.download(node.path)
      useApp.getState().pushToast({ kind: 'success', message: `↓ ${node.name}` })
    } catch (err) {
      useApp.getState().pushToast({ kind: 'error', message: String((err as Error).message || err) })
    }
  }

  const actions = (
    <span className="ms-auto flex shrink-0 items-center gap-0.5 pe-1.5 opacity-0 transition group-hover/node:opacity-100">
      {node.type === 'file' && (
        <button onClick={dlNode} className="rounded p-1 text-slate-500 transition hover:bg-white/10 hover:text-cyan-300" title="تنزيل الملف">
          <Download size={12} />
        </button>
      )}
      <button onClick={delNode} className="rounded p-1 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400" title="حذف">
        <Trash2 size={12} />
      </button>
    </span>
  )

  if (node.type === 'dir') {
    const Icon = open ? FolderOpen : Folder
    return (
      <div>
        <div className="group/node flex items-center rounded-lg transition hover:bg-white/5">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-start text-slate-300"
            style={{ paddingInlineStart: depth * 14 + 8 }}
          >
            {open ? <ChevronDown size={14} className="shrink-0 text-slate-500" /> : <ChevronLeft size={14} className="shrink-0 text-slate-500" />}
            <Icon size={15} className="shrink-0 text-cyan-400/80" />
            <span className="truncate text-[13px]" dir="auto">
              {node.name}
            </span>
          </button>
          {actions}
        </div>
        {open && node.children?.map((c) => <Node key={c.path} node={c} depth={depth + 1} />)}
      </div>
    )
  }

  const Icon = extIcon(node.name)

  const openFile = async () => {
    const set = useApp.getState()
    set.setActiveFile(node.path)
    try {
      const d = await workspace.read(node.path)
      set.setFileContent(d.content)
    } catch {
      set.setFileContent('// تعذّر قراءة الملف')
    }
    set.bumpPreview()
  }

  return (
    <div className="group/node flex items-center rounded-lg transition hover:bg-white/5">
      <button
        onClick={openFile}
        className={`flex min-w-0 flex-1 items-center gap-1.5 px-2 py-[3px] text-start transition ${
          active ? 'bg-cyan-400/10 !text-cyan-200' : 'text-slate-300'
        }`}
        style={{ paddingInlineStart: depth * 14 + 8 }}
      >
        <Icon size={14} className="shrink-0 text-violet-400/80" />
        <span className="truncate text-[12.5px]" dir="auto">
          {node.name}
        </span>
      </button>
      {actions}
    </div>
  )
}

export function FileTree() {
  const files = useApp((s) => s.files)
  const projectName = useApp((s) => s.projectName)
  const dirs = files.filter((f) => f.type === 'dir')
  const projects = dirs.filter((f) => !f.name.startsWith('_') && f.name !== 'uploads')
  const rootFiles = files.filter((f) => f.type === 'file')
  const pick = (p: string) => useApp.getState().openArena(p)

  return (
    <div className="flex h-full flex-col">
      {projects.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-white/5 p-2">
          {[
            { n: 'all', label: 'كل المساحة' },
            ...projects.map((p) => ({ n: p.name, label: p.name })),
          ].map((p) => (
            <button
              key={p.n}
              onClick={() => pick(p.n)}
              className={`rounded-lg px-2 py-0.5 text-[11px] transition ${
                (p.n === 'all' && projectName === 'project') || p.n === projectName
                  ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/30'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto p-2">
        {dirs.map((d) => (
          <Node key={d.path} node={d} depth={0} />
        ))}
        {rootFiles.map((f) => (
          <Node key={f.path} node={f} depth={0} />
        ))}
        {!files.length && (
          <div className="mt-10 flex flex-col items-center gap-2 text-center text-slate-500">
            <FileText size={28} className="opacity-40" />
            <p className="text-xs">لا ملفات بعد — اطلب من الوكيل بناء مشروع</p>
          </div>
        )}
      </div>
    </div>
  )
}