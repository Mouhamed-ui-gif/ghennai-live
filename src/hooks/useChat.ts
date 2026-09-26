import { useCallback } from 'react'
import { useApp } from '../store/app'
import { chatStream, workspace, vision, deploy } from '../api/client'
import { handleChatEvent } from './chatEvents'

export interface ChatOpts {
  onCodingDone?: (project: string, built: boolean) => void
}

export function useChat() {
  const { addUserMsg, setBusy, pushActivity, openArena } = useApp.getState()

  const send = useCallback(
    async (content: string, agent?: string) => {
      if (!content.trim()) return
      addUserMsg(content)
      setBusy(true)
      const base = useApp.getState().projectName
      const currentAgent = useApp.getState().agent
      const buildReq = currentAgent === 'Coding' || /(ابن\b|[بب]ن[يﺎ]|build|create|أنشئ|اصنع|صمم.*موقع|صمم.*صفحة|موقع عن|لوحة تحكم|صفحة هبوط|قالب|site|landing|portfolio)/i.test(content)
      if (buildReq && base && useApp.getState().arenaOpen) openArena(base)
      await chatStream(
        { message: content, agent },
        (e) => handleChatEvent(e),
        async () => {
          useApp.getState().setBusy(false)
          const { refreshTree } = await import('./chatEvents')
          await refreshTree()
          useApp.getState().bumpPreview()
          setTimeout(() => useApp.getState().setBusy(false), 2000)
        }
      )
      useApp.getState().setBusy(false)
    },
    [addUserMsg, openArena, setBusy]
  )

  const analyzeImage = useCallback(
    async (dataUrl: string, intent?: string) => {
      const { agent } = useApp.getState()
      const buildReq = /(ابن|انشئ|اصنع|صمم|نف[ي]?ذ|حول|تحويل|موقع|build|create|make|convert|code|نفّد)/i.test(intent || '') || agent === 'Coding'
      setBusy(true)
      useApp.getState().addAssistantMsg('🖼️ **جارٍ تحليل الصورة…** ثوانٍ ويكون جاهزًا ⚡')
      pushActivity({ agent: 'Vision', message: buildReq ? '🖼️ تحليل الصورة وتحويلها إلى مواصفة بناء…' : '🖼️ تحليل الصورة…', status: 'running' })
      try {
        const d = await vision(dataUrl, buildReq ? 'build' : 'describe')
        const description = (d as { content?: string }).content || ''
        if (!buildReq) {
          useApp.getState().addAssistantMsg(`🖼️ **تحليل الصورة:**\n\n${description}`)
          pushActivity({ agent: 'Vision', message: '✅ تم التحليل', status: 'success' })
        } else {
          useApp.getState().addAssistantMsg(`🖼️ **تحليل الصورة والمخطط:**\n\n${description}\n\n---\n**⚙️ سأبنيه الآن لك…**`)
          pushActivity({ agent: 'Vision', message: '🖼️ جاهز للبناء من الصورة', status: 'success' })
          useApp.getState().openArena(useApp.getState().projectName || 'project')
          const buildGoal = `لديك مواصفة بناء استُخرجت من الصورة المرفوعة. أُنشئ موقعًا كاملًا (index.html + style.css + app.js) يطابقها بدقة. المواصفة:\n${description}`
          await send(buildGoal, 'Coding')
        }
      } catch (err) {
        pushActivity({ agent: 'Vision', message: '✗ فشل التحليل', status: 'error' })
        useApp.getState().addAssistantMsg('⚠️ فشل تحليل الصورة: ' + String((err as Error).message))
        useApp.getState().pushToast({ kind: 'error', title: 'فشل تحليل الصورة', message: String((err as Error).message).slice(0, 140) })
      } finally {
        setBusy(false)
      }
    },
    [pushActivity, setBusy, send]
  )

  const uploadFile = useCallback(
    async (file: File) => {
      const d = await workspace.upload(file)
      useApp.getState().addAssistantMsg(`📎 تم رفع \`${d.path}\` إلى مساحة العمل (${d.size} بايت).`)
      useApp.getState().pushToast({ kind: 'success', title: 'تم رفع الملف', message: `${d.path} (${d.size} بايت)` })
      const { refreshTree } = await import('./chatEvents')
      await refreshTree()
    },
    []
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

  /** إصلاح تلقائي حقيقي: يستدعي الـAgent فعليًا بخطأ + الطلب الأصلي (وليس زرًا وهميًا) */
  const fixError = useCallback(
    async (errorText: string, agent?: string) => {
      const { msgs } = useApp.getState()
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
      const prompt = `🔧 أصلح هذا الخطأ من الجذر تلقائيًا: اقرأ الملفات والسجلات المتعلقة أولًا (searchFiles/readFile/previewLogs)، حدد السبب، نفّذ الإصلاح بالأدوات، ثم تحقق.\nالطلب الأصلي: ${lastUser ? lastUser.content.slice(0, 300) : '—'}\nالخطأ:\n${errorText.slice(0, 800)}`
      await send(prompt, agent || 'Coding')
    },
    [send]
  )

  return { send, analyzeImage, uploadFile, regenerate, editAndSend, fixError }
}

export function publishToGitHub(project: string) {
  return deploy.run(project)
}