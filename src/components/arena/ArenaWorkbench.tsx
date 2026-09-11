import { useEffect, useRef, useState } from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'
import { FolderTree, Rocket, X, Sparkles, Play, Save, TerminalSquare, PanelLeftOpen, MonitorPlay } from 'lucide-react'
import { useApp } from '../../store/app'
import { CodeTerminal } from './CodeTerminal'
import { FileManager } from './FileManager'
import { CodeEditor } from './CodeEditor'
import { PreviewPane } from './PreviewPane'
import { PublishDrawer } from './PublishDrawer'
import { workspace } from '../../api/client'
import { useI18n } from '../../i18n'

type Lang = 'html' | 'css' | 'js' | 'react'

const BOILERPLATE: Record<Lang, { file: string; code: string }> = {
  html: {
    file: 'index.html',
    code: `<!doctype html>
<html lang="ar">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>مشروع Ghennai</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="hero">
      <h1>مرحبًا بك في مشروعك! ⚡</h1>
      <p>صُنع بواسطة خطّ البناء الأسطوري: المعمار → المبرمج → المصمّم → المعلّم → الجني</p>
      <button onclick="runDemo()">جرّبني</button>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`,
  },
  css: {
    file: 'style.css',
    code: `* { margin: 0; box-sizing: border-box; }
body {
  font-family: system-ui, sans-serif;
  background: radial-gradient(ellipse at 20% 50%, #0ea5e9 0%, transparent 55%),
              radial-gradient(ellipse at 80% 20%, #8b5cf6 0%, transparent 50%), #0a0a0f;
  color: #fff;
  min-height: 100vh;
  display: grid;
  place-items: center;
}
.hero { text-align: center; padding: 32px; }
h1 { font-size: 2.2rem; background: linear-gradient(90deg, #22d3ee, #a78bfa); -webkit-background-clip: text; background-clip: text; color: transparent; }
p { margin: 12px 0 20px; color: #cbd5e1; }
button {
  padding: 10px 22px; border: 0; border-radius: 999px;
  background: linear-gradient(135deg, #06b6d4, #8b5cf6); color: #fff;
  font-size: 1rem; cursor: pointer; box-shadow: 0 8px 30px rgba(6,182,212,.35);
}
`,
  },
  js: {
    file: 'app.js',
    code: `function runDemo() {
  const btn = document.querySelector('button');
  btn.textContent = 'شكرًا لك! 🧞';
  btn.style.transform = 'scale(1.15)';
  console.log('Ghennai build pipeline → live demo!');
}
`,
  },
  react: {
    file: 'App.jsx',
    code: `export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 40, textAlign: 'center' }}>
      <h1>تطبيق React ⚛️</h1>
      <p>هذا ملف App.jsx جاهز للربط وقابل للتعديل.</p>
    </main>
  );
}
`,
  },
}

export function ArenaWorkbench({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n()
  const [filesOpen, setFilesOpen] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(true)
  const termOpen = useApp((s) => s.termOpen)
  const setTermOpen = useApp((s) => s.setTermOpen)
  const [termH, setTermH] = useState(300)
  const [maxTerm, setMaxTerm] = useState(false)
  const arenaOpen = useApp((s) => s.arenaOpen)
  const built = useApp((s) => s.built)
  const busy = useApp((s) => s.busy)
  const dragRef = useRef<{ y: number; h: number } | null>(null)

  useEffect(() => {
    if (!arenaOpen) setPreviewOpen(true)
  }, [arenaOpen])

  if (!arenaOpen) return null

  const openFile = async (rel: string, fallback: string) => {
    const base = useApp.getState().projectName && useApp.getState().projectName !== 'project' ? useApp.getState().projectName + '/' : ''
    const p = base + rel
    try {
      const d = await workspace.read(p)
      useApp.getState().setActiveFile(p)
      useApp.getState().setFileContent(d.content)
    } catch {
      await workspace.write(p, fallback)
      useApp.getState().setActiveFile(p)
      useApp.getState().setFileContent(fallback)
      workspace.tree().then((d) => useApp.getState().setFiles((d as { tree: never }).tree)).catch(() => undefined)
    }
    useApp.getState().bumpPreview()
  }

  const openLang = (l: Lang) => {
    void openFile(BOILERPLATE[l].file, BOILERPLATE[l].code)
  }

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = { y: e.clientY, h: termH }
    const onMove = (ev: PointerEvent) => {
      const max = window.innerHeight - 60
      setTermH(Math.max(300, Math.min(max, dragRef.current!.h + (dragRef.current!.y - ev.clientY))))
    }
    const stop = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', stop)
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', stop)
  }

  const toggleBtn =
    'me-1 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-medium transition'

  const effectiveH = maxTerm ? Math.max(300, Math.round(window.innerHeight * 0.62)) : termH

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-s border-white/10 bg-night-950/35 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 bg-night-900/50 px-2 py-1.5">
        <span className="me-2 flex items-center gap-1.5 px-1 text-[11px] font-bold tracking-tight text-violet-300">
          <Sparkles size={13} /> {t('arena.title')}
        </span>

        <button
          onClick={() => setFilesOpen((v) => !v)}
          className={`${toggleBtn} ${filesOpen ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'}`}
          title={lang === 'ar' ? 'ملفات' : 'Files'}
        >
          {filesOpen ? <FolderTree size={14} /> : <PanelLeftOpen size={14} />}
          {t('arena.files')}
        </button>
        <button
          onClick={() => setPreviewOpen((v) => !v)}
          className={`${toggleBtn} ${previewOpen ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'}`}
          title={lang === 'ar' ? 'معاينة حية' : 'Live preview'}
        >
          <MonitorPlay size={14} />
          {t('arena.preview')}
        </button>

        <span className="mx-1 h-4 w-px bg-white/10" />

        <div className="flex items-center gap-1">
          {(['html', 'css', 'js', 'react'] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => openLang(l)}
              title={lang === 'ar' ? `افتح ملف ${l}` : `Open ${l} file`}
              className="rounded-lg px-2 py-1 font-mono text-[11px] font-bold uppercase text-slate-400 transition hover:bg-violet-400/10 hover:text-violet-300"
            >
              {l === 'js' ? '⚡ JS' : '📝 ' + l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => useApp.getState().requestSave()}
          className="me-1 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          title="حفظ الملف (Ctrl+S)"
        >
          <Save size={14} /> {lang === 'ar' ? 'حفظ' : 'Save'}
        </button>
        <button
          onClick={() => {
            setPreviewOpen(true)
            useApp.getState().bumpPreview()
          }}
          className="me-1 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium text-emerald-300 transition hover:bg-emerald-400/10"
          title="تشغيل المعاينة الحية"
        >
          <Play size={14} /> {lang === 'ar' ? 'تشغيل' : 'Run'}
        </button>
        <button
          onClick={() => setTermOpen(!termOpen)}
          className={`${toggleBtn} ${termOpen ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400 hover:bg-white/8 hover:text-white'}`}
          title="إظهار / إخفاء الطرفية"
        >
          <TerminalSquare size={14} className={busy ? 'animate-pulse text-emerald-300' : ''} />
          {lang === 'ar' ? 'الطرفية' : 'Terminal'}
          <span className={`ms-0.5 h-1.5 w-1.5 rounded-full ${termOpen ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        </button>
        {built && (
          <button
            onClick={() => {
              useApp.getState().setDeployState('idle')
              useApp.getState().invokeDeploy()
            }}
            className="me-1 flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-cyan-500 to-violet-500 px-3 py-1.5 text-[12px] font-bold text-white shadow-[0_0_18px_rgba(6,182,212,.45)] transition hover:brightness-110"
          >
            <Rocket size={14} /> {t('arena.publish')}
          </button>
        )}
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" title="إغلاق">
          <X size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <Group orientation="horizontal" className="flex h-full min-h-0 w-full">
          {filesOpen && (
            <>
              <Panel id="arena-files" defaultSize={26} minSize={16}>
                <div className="h-full min-h-0">
                  <FileManager />
                </div>
              </Panel>
              <Separator className="w-1.5 min-w-1.5 bg-white/5 transition-colors hover:bg-cyan-400/40" />
            </>
          )}
          <Panel id="arena-tools" defaultSize={74} minSize={45}>
            <div className="flex h-full min-h-0 flex-col">
              <Group orientation="vertical" className="flex w-full min-h-0 flex-1">
                <Panel id="arena-editor" defaultSize={68} minSize={30}>
                  <div className="h-full min-h-0">
                    <CodeEditor />
                  </div>
                </Panel>
                {previewOpen && (
                  <>
                    <Separator className="h-1.5 min-h-1.5 bg-white/5 transition-colors hover:bg-emerald-400/40" />
                    <Panel id="arena-preview" defaultSize={32} minSize={12}>
                      <div className="h-full min-h-0">
                        <PreviewPane />
                      </div>
                    </Panel>
                  </>
                )}
              </Group>
            </div>
          </Panel>
        </Group>

        {termOpen && (
          <div data-term className="relative flex shrink-0 flex-col border-t border-white/10 bg-[#080b16]" style={{ height: effectiveH }}>
            <CodeTerminal
              header="ghennai · agent"
              termH={termH}
              maxTerm={maxTerm}
              onMax={() => setMaxTerm((v) => !v)}
              onClose={() => setTermOpen(false)}
              onDragStart={startResize}
            />
          </div>
        )}
      </div>

      <PublishDrawer />
    </div>
  )
}