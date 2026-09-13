import type { SSEvent } from '../api/client'
import type { ProjectInfo } from '../store/app'
import { useApp } from '../store/app'
import { workspace } from '../api/client'
import { speakText, voiceFor } from '../components/dashboard/voice'

export async function refreshTree(): Promise<void> {
  try {
    const d = await workspace.tree()
    useApp.getState().setFiles(d.tree as never)
  } catch {
    /* noop */
  }
}

const uiLang = () => (document.documentElement.lang === 'ar' ? 'ar' : 'en')

/** المعالج المشترك لكل أحداث الدفق — يستخدمه لوحة الدردشة ووضع البرمجة معًا */
export function handleChatEvent(e: SSEvent): void {
  switch (e.type) {
    case 'coding_start': {
      const ev = e as unknown as { project?: string; request?: string; mode?: string; element?: unknown; root?: string | null }
      const st = useApp.getState()
      const editing = ev.mode === 'edit' || ev.mode === 'propose'
      st.setEditPend(null)
      st.enterCodingMode(ev.project || 'الموقع الجديد', editing ? 'edit' : 'build', ev.request || '')
      st.setCodingProjectFolder(ev.root || null)
      st.pushCodeAction({ kind: 'notice', text: editing ? `✂️ ${ev.request?.slice(0, 140) || 'تعديل عنصر'}` : `⏺ بدء بناء «${ev.project}»` })
      if (editing && ev.element) st.setEditTarget(ev.element as { tag: string; id: string; className: string; text: string; href?: string | null; src?: string | null })
      st.pushActivity({ agent: 'Coding', message: editing ? (ev.mode === 'propose' ? '📋 يحضّر مقترح التعديل…' : '✂️ تعديل عنصر محدد') : `⏺ يبدأ بناء «${ev.project}»`, status: 'running' })
      if (st.codingVoice) speakText('بسْمِ الله، بدأْتُ العملَ الآن — ستَرى الكودَ يُكتبُ أمامَك حرفًا بحرف', uiLang(), undefined, voiceFor('Coding'))
      void st.refreshProjects()
      break
    }
    case 'project_state': {
      const ev = e as unknown as { project?: ProjectInfo }
      const st = useApp.getState()
      if (ev.project) {
        st.upsertProject(ev.project)
        if (!st.activeProject && st.codingOpen) st.setActiveProject(ev.project)
      }
      break
    }
    case 'validation_report': {
      const ev = e as unknown as { ok?: boolean; checks?: { ok: boolean; label: string; file?: string }[] }
      const st = useApp.getState()
      st.pushCodeAction({
        kind: ev.ok ? 'ok' : 'info',
        text: ev.ok ? 'الفحص الشامل قبل النشر: كل شيء سليم ✓' : `الفحص رصد (${(ev.checks || []).filter((c) => !c.ok).length}) مشكلة — يُصلحها…`,
      })
      if (ev.ok && ev.checks) {
        for (const c of ev.checks.slice(0, 12)) st.pushCodeAction({ kind: 'ok', text: `✓ ${c.label}` })
      }
      if (st.codingVoice && ev.ok && st.codingOpen) {
        speakText('تمَّتِ الفحوصاتُ كلُّها بنجاح — الموقعُ مدقّقٌ وجاهز', uiLang(), undefined, voiceFor('Coding'))
      }
      break
    }
    case 'edit_proposal': {
      const ev = e as unknown as { element?: unknown; root?: string | null; request?: string; summary?: string }
      const st = useApp.getState()
      st.setEditBusy(false)
      st.setEditPend({
        element: (ev.element as { tag: string; id: string; className: string; text: string; href?: string | null; src?: string | null } | undefined) ?? (st.editTarget as { tag: string; id: string; className: string; text: string; href?: string | null; src?: string | null } | null) ?? null,
        root: ev.root ?? st.codingProjectFolder,
        request: ev.request || '',
        summary: ev.summary || 'اقتراحي جاهز — وافق على التعديل.',
      })
      st.pushCodeAction({ kind: 'edit', text: `📋 اقتراح: ${(ev.summary || '').replace(/\n+/g, ' ').slice(0, 180)}` })
      st.pushActivity({ agent: 'Coding', message: '📋 اقتراح التعديل جاهز — ينتظر موافقتك', status: 'info' })
      if (st.codingVoice && st.codingOpen) speakText('اقتراحي جاهز — وافِق على التعديل وأطبّقه فورًا', uiLang(), undefined, voiceFor('Coding'))
      break
    }
    case 'deploy_progress': {
      const ev = e as unknown as { stage?: string; message?: string }
      const st = useApp.getState()
      st.setDeployState('deploying')
      if (ev.message) {
        st.pushDeployStage(ev.message)
        if (st.codingOpen) st.pushCodeAction({ kind: 'info', text: `🚀 ${ev.message}` })
      }
      break
    }
    case 'deploy_verified': {
      const ev = e as unknown as { url?: string }
      const st = useApp.getState()
      st.setDeployState('done', ev.url ?? null, null)
      if (ev.url && st.codingOpen) st.pushCodeAction({ kind: 'ok', text: `الرابط حي ✓ ${ev.url}` })
      break
    }
    case 'deploy_done': {
      const ev = e as unknown as { url?: string; repoUrl?: string }
      const st = useApp.getState()
      st.setDeployState('done', ev.url ?? null, null)
      st.pushCodeAction({ kind: 'ok', text: `نُشر الموقع على رابطك: ${ev.url}` })
      st.pushToast({ kind: 'success', title: 'موقعك أصبح حيًا! 🚀', message: ev.url || '' })
      if (st.codingVoice && st.codingOpen) {
        speakText('تمّ النشرُ بنجاح — موقعُك الآن على رابطٍ دائم يمكنكَ فتحُه من الزرّ', uiLang(), undefined, voiceFor('Coding'))
      }
      void st.refreshProjects()
      break
    }
    case 'project_restored': {
      const ev = e as unknown as { id?: string; version?: number }
      const st = useApp.getState()
      st.pushToast({ kind: 'success', title: 'تم الاسترجاع', message: `رُجِع المشروع إلى النسخة v${ev.version ?? ''}` })
      void refreshTree()
      st.bumpPreview()
      void st.refreshProjects()
      break
    }
    case 'code_token': {
      const ev = e as unknown as { content?: string; file?: string | null; action?: string }
      useApp.getState().codeToken({ content: ev.content ?? null, file: ev.file ?? null, action: ev.action ?? null })
      break
    }
    case 'agent_event': {
      const ev = e as unknown as { agent: string; tool?: string; message?: string; status?: string }
      const st = useApp.getState()
      if (ev.agent === 'Coding') {
        st.openArena(st.projectName || 'project')
        if (ev.tool) {
          const t = (ev.message as string) || ''
          if (t.startsWith('▶️')) st.pushCodeAction({ kind: 'cmd', text: t.replace('▶️ ', '').replace(/^\$ /, '') })
          if (t.startsWith('✅')) st.pushCodeAction({ kind: 'ok', text: t.replace('✅ ', '') })
        }
      }
      if (ev.agent === 'Coding' && ev.tool && (ev.message || '').startsWith('▶️')) {
        st.setTermOpen(true)
        st.pushTerm({ kind: 'cmd', text: (ev.message as string).replace('▶️ ', '') + '\n' })
      }
      if (ev.agent === 'Coding' && ev.status === 'success' && ev.tool) {
        st.pushTerm({ kind: 'out', text: `✓ ${(ev.message as string).replace('✅ ', '')}\n` })
      }
      break
    }
    case 'terminal_data': {
      const ev = e as unknown as { kind: string; data: string }
      const kind = ev.kind === 'err' ? 'err' : ev.kind === 'cmd' ? 'cmd' : 'out'
      useApp.getState().pushTerm({ kind, text: String(ev.data || '') })
      break
    }
    case 'workspace_changed': {
      const ev = e as unknown as { path?: string; repaired?: boolean }
      const st = useApp.getState()
      if (st.codingOpen && ev.path && /\.(html?|css|js|mjs|json|svg)$/i.test(String(ev.path)) && !ev.repaired) {
        st.upsertCodeFile(String(ev.path))
      }
      if (st.projectName === 'project' && ev.path) {
        const p = String(ev.path)
        const slash = p.indexOf('/')
        const first = slash > 0 ? p.slice(0, slash) : null
        if (first && !first.startsWith('_') && first !== 'uploads' && !ev.repaired) {
          st.openArena(first)
        }
      }
      void refreshTree()
      st.bumpPreview()
      break
    }
    case 'coding_done': {
      const ev = e as unknown as { built?: boolean }
      const st = useApp.getState()
      st.setCodingDone(!!ev.built)
      st.setBuilt(!!ev.built)
      st.pushCodeAction({ kind: 'ok', text: ev.built ? 'اكتمل البناء ✓' : 'انتهت المهمة ✓' })
      st.pushActivity({ agent: 'Coding', message: ev.built ? '✅ اكتمل البناء ونُنشر عند الطلب' : '✅ انتهت المهمة', status: 'success' })
      if (st.codingVoice && st.codingOpen) {
        speakText(ev.built ? 'تمّتِ المهمةُ بنجاح — موقعُك أصبحَ جاهزًا الآن، وبإمكانِكَ نشره برابطٍ دائم' : 'انتهيتُ من العملِ بنجاح', uiLang(), undefined, voiceFor('Coding'))
      }
      void refreshTree()
      void st.refreshProjects()
      st.bumpPreview()
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
      if (prefs.speechOut && ev.content && !/^\s*⚠/.test(ev.content)) {
        speakText(ev.content, uiLang(), undefined, voiceFor(ev.agent || ''))
      }
      break
    }
    case 'error': {
      const ev = e as unknown as { error: string }
      const st = useApp.getState()
      if (st.codingOpen) st.setCodingError(ev.error || 'خطأ غير متوقع')
      st.addAssistantMsg('⚠️ ' + (ev.error || 'خطأ غير متوقع'))
      st.pushToast({ kind: 'error', title: 'خطأ', message: (ev.error || 'حدث خطأ غير متوقع').slice(0, 140) })
      break
    }
    default:
      break
  }
}