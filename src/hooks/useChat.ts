import { useCallback, useRef } from 'react'
import { useApp } from '../store/app'
import { chatStream, workspace, vision, deploy, type SSEvent } from '../api/client'
import { speakText, voiceFor } from '../components/dashboard/voice'

export interface ChatOpts {
  onCodingDone?: (project: string, built: boolean) => void
}

export function useChat() {
  const { addUserMsg, addAssistantMsg, setBusy, pushActivity, pushTerm, openArena, bumpPreview } = useApp.getState()
  const runner = useRef<{ stop: () => void } | null>(null)

  const refreshTree = useCallback(async () => {
    try {
      const d = await workspace.tree()
      useApp.getState().setFiles(d.tree as never)
    } catch { /* noop */ }
  }, [])

  const handleEvent = useCallback(
    (e: SSEvent) => {
      switch (e.type) {
        case 'agent_event': {
          const ev = e as unknown as { agent: string; tool?: string; message?: string; status?: string }
          if (ev.agent === 'Coding') {
            openArena(useApp.getState().projectName || 'project')
          }
          if (ev.agent === 'Coding' && ev.tool && (ev.message || '').startsWith('▶️')) {
            useApp.getState().setTermOpen(true)
            pushTerm({ kind: 'cmd', text: (ev.message as string).replace('▶️ ', '') + '\n' })
          }
          if (ev.agent === 'Coding' && ev.status === 'success' && ev.tool) {
            pushTerm({ kind: 'out', text: `✓ ${(ev.message as string).replace('✅ ', '')}\n` })
          }
          break
        }
        case 'terminal_data': {
          const ev = e as unknown as { kind: string; data: string }
          const kind = ev.kind === 'err' ? 'err' : ev.kind === 'cmd' ? 'cmd' : 'out'
          pushTerm({ kind, text: String(ev.data || '') })
          break
        }
        case 'workspace_changed': {
          const ev = e as unknown as { path?: string; repaired?: boolean }
          const cur = useApp.getState().projectName
          if (cur === 'project' && ev.path) {
            const first = String(ev.path).split('/')[0]
            if (first && !first.startsWith('_') && first !== 'uploads' && !ev.repaired) {
              useApp.getState().openArena(first)
            }
          }
          void refreshTree()
          bumpPreview()
          break
        }
        case 'coding_done': {
          const ev = e as unknown as { built?: boolean }
          useApp.getState().setBuilt(!!ev.built)
          void refreshTree()
          bumpPreview()
          setTimeout(() => refreshTree(), 3000)
          break
        }
        case 'stream_chunk': {
          const ev = e as unknown as { content?: string }
          if (ev.content) useApp.getState().addStreamChunk(ev.content)
          break
        }
        case 'answer': {
          const ev = e as unknown as { content: string; agent?: string }
          useApp.getState().addFinalMessage(ev.content || '', ev.agent)
          const prefs = useApp.getState().prefs
          const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en'
          if (prefs.speechOut && ev.content && !/^\s*⚠/.test(ev.content)) {
            speakText(ev.content, lang, undefined, voiceFor(ev.agent || ''))
          }
          break
        }
        case 'error': {
          const ev = e as unknown as { error: string }
          addAssistantMsg('⚠️ ' + (ev.error || 'خطأ غير متوقع'))
          useApp.getState().pushToast({ kind: 'error', title: 'خطأ', message: (ev.error || 'حدث خطأ غير متوقع').slice(0, 140) })
          break
        }
        default:
          break
      }
    },
    [addAssistantMsg, bumpPreview, openArena, pushActivity, pushTerm, refreshTree]
  )

  const send = useCallback(
    async (content: string, agent?: string) => {
      if (!content.trim()) return
      addUserMsg(content)
      setBusy(true)
      const base = useApp.getState().projectName
      const currentAgent = useApp.getState().agent
      const buildReq = currentAgent === 'Coding' || /(ابن\b|[بب]ن[يﺎ]|build|create|أنشئ|اصنع|صمم.*موقع|صمم.*صفحة|موقع عن|لوحة تحكم|صفحة هبوط|قالب|site|landing|portfolio)/i.test(content)
      if (buildReq && base) openArena(base)
      await chatStream(
        { message: content, agent },
        (e) => handleEvent(e),
        () => {
          useApp.getState().setBusy(false)
          void refreshTree()
          bumpPreview()
          setTimeout(() => useApp.getState().setBusy(false), 2000)
        }
      )
      useApp.getState().setBusy(false)
    },
    [addUserMsg, handleEvent, openArena, refreshTree, setBusy]
  )

  const analyzeImage = useCallback(
    async (dataUrl: string, intent?: string) => {
      const { agent } = useApp.getState()
      const buildReq = /(ابن|انشئ|اصنع|صمم|نف[ي]?ذ|حول|تحويل|موقع|build|create|make|convert|code|نفّد)/i.test(intent || '') || agent === 'Coding'
      setBusy(true)
      addAssistantMsg('🖼️ **جارٍ تحليل الصورة محليًا (moondream)…** قد يستغرق دقيقة تقريبًا.')
      pushActivity({ agent: 'Vision', message: buildReq ? '🖼️ تحليل الصورة وتحويلها إلى مواصفة بناء…' : '🖼️ تحليل الصورة…', status: 'running' })
      try {
        const d = await vision(dataUrl, buildReq ? 'build' : 'describe')
        const description = (d as { content?: string }).content || ''
        if (!buildReq) {
          addAssistantMsg(`🖼️ **تحليل الصورة:**\n\n${description}`)
          pushActivity({ agent: 'Vision', message: '✅ تم التحليل', status: 'success' })
        } else {
          addAssistantMsg(`🖼️ **تحليل الصورة والمخطط:**\n\n${description}\n\n---\n**⚙️ سأبنيه الآن لك…**`)
          pushActivity({ agent: 'Vision', message: '🖼️ جاهز للبناء من الصورة', status: 'success' })
          useApp.getState().openArena(useApp.getState().projectName || 'project')
          const buildGoal = `لديك مواصفة بناء استُخرجت من الصورة المرفوعة. أُنشئ موقعًا كاملًا (index.html + style.css + app.js) يطابقها بدقة. المواصفة:\n${description}`
          await send(buildGoal, 'Coding')
        }
      } catch (err) {
        pushActivity({ agent: 'Vision', message: '✗ فشل التحليل', status: 'error' })
        addAssistantMsg('⚠️ فشل تحليل الصورة: ' + String((err as Error).message))
        useApp.getState().pushToast({ kind: 'error', title: 'فشل تحليل الصورة', message: String((err as Error).message).slice(0, 140) })
      } finally {
        setBusy(false)
      }
    },
    [addAssistantMsg, pushActivity, setBusy, send]
  )

  const uploadFile = useCallback(
    async (file: File) => {
      const d = await workspace.upload(file)
      addAssistantMsg(`📎 تم رفع \`${d.path}\` إلى مساحة العمل (${d.size} بايت).`)
      useApp.getState().pushToast({ kind: 'success', title: 'تم رفع الملف', message: `${d.path} (${d.size} بايت)` })
      void refreshTree()
    },
    [addAssistantMsg, refreshTree]
  )

  const regenerate = useCallback(
    (userText: string, agent?: string) => {
      const { msgs } = useApp.getState()
      const idx = [...msgs].reverse().findIndex((m) => m.role === 'user' && m.content === userText)
      if (idx === -1) {
        void send(userText, agent)
        return
      }
      const keep = msgs.length - 1 - idx
      useApp.getState().purgeFrom(keep + 1)
      void send(userText, agent)
    },
    [send]
  )

  const editAndSend = useCallback(
    async (index: number, newText: string, agent?: string) => {
      const { msgs } = useApp.getState()
      if (!msgs[index] || !newText.trim()) return
      useApp.getState().replaceMsg(msgs[index].id, newText.trim())
      useApp.getState().purgeFrom(index + 1)
      await send(newText.trim(), agent)
    },
    [send]
  )

  return { send, analyzeImage, uploadFile, regenerate, editAndSend }
}

export function publishToGitHub(project: string) {
  return deploy.run(project)
}