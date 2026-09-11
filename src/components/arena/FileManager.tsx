import { useRef } from 'react'
import { FilePlus2, FolderPlus, Upload, RefreshCw, Download, FolderOpen } from 'lucide-react'
import { useApp } from '../../store/app'
import { workspace } from '../../api/client'
import { useI18n } from '../../i18n'
import { FileTree } from './FileTree'

export function FileManager() {
  const { t, lang } = useI18n()
  const uploadRef = useRef<HTMLInputElement>(null)
  const projectName = useApp((s) => s.projectName)

  const base = projectName && projectName !== 'project' ? projectName + '/' : ''

  const refresh = () =>
    workspace
      .tree()
      .then((d) => useApp.getState().setFiles((d as { tree: never }).tree))
      .catch((e) => useApp.getState().pushToast({ kind: 'error', message: String((e as Error).message || e) }))

  const newFile = async () => {
    const name = window.prompt(lang === 'ar' ? 'اسم الملف الجديد (مثال: app.js):' : 'New file name (e.g. app.js):')
    if (!name || !name.trim()) return
    try {
      await workspace.touch(base + name.trim())
      useApp.getState().setActiveFile(base + name.trim())
      useApp.getState().setFileContent('')
      refresh()
    } catch (e) {
      useApp.getState().pushToast({ kind: 'error', message: String((e as Error).message || e) })
    }
  }

  const newFolder = async () => {
    const name = window.prompt(lang === 'ar' ? 'اسم المجلد الجديد:' : 'New folder name:')
    if (!name || !name.trim()) return
    try {
      await workspace.mkdir(base + name.trim())
      refresh()
    } catch (e) {
      useApp.getState().pushToast({ kind: 'error', message: String((e as Error).message || e) })
    }
  }

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    const push = useApp.getState().pushToast
    for (const f of files) {
      try {
        await workspace.upload(f, base || 'uploads/')
        push({ kind: 'success', message: `↑ ${f.name}` })
      } catch (err) {
        push({ kind: 'error', message: `✗ ${f.name} — ${String((err as Error).message || err)}` })
      }
    }
    refresh()
  }

  const downloadZip = async () => {
    try {
      const target = projectName && projectName !== 'project' ? projectName : '.'
      const blob = await workspace.zip(target)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${projectName || 'project'}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      useApp.getState().pushToast({ kind: 'success', message: lang === 'ar' ? 'تم تجهيز ZIP للتحميل' : 'Project ZIP ready' })
    } catch (e) {
      useApp.getState().pushToast({ kind: 'error', message: String((e as Error).message || e) })
    }
  }

  const btn =
    'flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white'

  const touch = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="flex h-full min-h-0 flex-col bg-night-950/30">
      <div className="flex items-center gap-1 border-b border-white/10 bg-night-900/50 px-2 py-2">
        <FolderOpen size={13} className="ms-1 shrink-0 text-cyan-400" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-200" dir="auto">
          {projectName || 'project'}
        </span>
        <button onClick={refresh} className={btn} title={lang === 'ar' ? 'تحديث' : 'Refresh'} onMouseDown={touch}>
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1.5">
        <button onClick={newFile} className={btn} title={lang === 'ar' ? 'ملف جديد' : 'New file'}>
          <FilePlus2 size={13} className="text-emerald-400" />
          {lang === 'ar' ? 'ملف' : 'File'}
        </button>
        <button onClick={newFolder} className={btn} title={lang === 'ar' ? 'مجلد جديد' : 'New folder'}>
          <FolderPlus size={13} className="text-amber-400" />
          {lang === 'ar' ? 'مجلد' : 'Folder'}
        </button>
        <button onClick={() => uploadRef.current?.click()} className={btn} title={lang === 'ar' ? 'رفع ملفات' : 'Upload files'}>
          <Upload size={13} className="text-violet-400" />
        </button>
        <button onClick={downloadZip} className={btn} title={lang === 'ar' ? 'تنزيل المشروع ZIP' : 'Project ZIP'}>
          <Download size={13} className="text-cyan-400" />
        </button>
        <input ref={uploadRef} type="file" multiple className="hidden" onChange={onUpload} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FileTree />
      </div>
      <p className="border-t border-white/5 px-3 py-1 text-[10px] text-slate-600" dir="ltr">
        {t('arena.tip')}
      </p>
    </div>
  )
}