import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useApp } from '../../store/app'
import { workspace } from '../../api/client'
import './EditorLoader'

function langOf(name: string) {
  const e = name.split('.').pop()?.toLowerCase() || ''
  if (['ts', 'tsx'].includes(e)) return 'typescript'
  if (['js', 'jsx', 'mjs'].includes(e)) return 'javascript'
  if (['html', 'htm'].includes(e)) return 'html'
  if (['css', 'scss', 'less'].includes(e)) return 'css'
  if (['json'].includes(e)) return 'json'
  if (['md'].includes(e)) return 'markdown'
  if (['py'].includes(e)) return 'python'
  if (['go'].includes(e)) return 'go'
  if (['rs'].includes(e)) return 'rust'
  if (['java'].includes(e)) return 'java'
  return 'plaintext'
}

export function CodeEditor() {
  const activeFile = useApp((s) => s.activeFile)
  const fileContent = useApp((s) => s.fileContent)
  const saveTick = useApp((s) => s.saveTick)
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(true)

  const keyFor = (p: string) => 'ghn_code_' + p

  useEffect(() => {
    const restored = activeFile ? sessionStorage.getItem(keyFor(activeFile)) : null
    setDraft(restored ?? fileContent ?? '')
    setSaved(restored === null || restored === fileContent)
  }, [activeFile, fileContent])

  useEffect(() => {
    if (!activeFile) return
    try {
      sessionStorage.setItem(keyFor(activeFile), draft)
    } catch { /* noop */ }
  }, [draft, activeFile])

  useEffect(() => {
    if (!saveTick) return
    if (activeFile && draft && draft !== fileContent) void save(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTick])

  const lang = useMemo(() => langOf(activeFile || ''), [activeFile])

  const save = async (text: string) => {
    if (!activeFile || !text.trim()) return
    if (text === fileContent) return
    try {
      await workspace.write(activeFile, text)
      useApp.getState().upsertFileContent(activeFile, text)
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }

  if (!activeFile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-night-950/50 text-slate-400">
        <span className="text-5xl">⌨️</span>
        <p className="text-sm">اختر ملفًا من لوحة الملفات لعرضه وتعديله</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 bg-night-900/50 px-3 py-1.5">
        <span className="font-mono text-[12px] text-cyan-300" dir="ltr">
          {activeFile}
        </span>
        <span className="flex items-center gap-2 text-[11px]">
          {!saved ? <span className="text-amber-400">● غير محفوظ</span> : <span className="text-emerald-400">✓ محفوظ</span>}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          language={lang}
          value={draft}
          onChange={(v) => {
            setDraft(v || '')
            setSaved(false)
            const id = setTimeout(() => save(v || ''), 900)
            return () => clearTimeout(id)
          }}
          onMount={(editor) => {
            editor.addCommand(2 | 1, () => save(editor.getValue())) // ctrl+s / cmd+s
          }}
          theme="vs-dark"
          options={{
            fontSize: 13.5,
            fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 10 },
            renderWhitespace: 'none',
            bracketPairColorization: { enabled: true },
            lineHeight: 20,
          }}
        />
      </div>
    </div>
  )
}