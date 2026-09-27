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

/** تحويل الروابط النسبية (/live/code/) إلى مطلقة من أصل التطبيق الحالي */
const abs = (u?: string | null) => {
  if (!u) return null
  return u.startsWith('/') ? `${window.location.origin}${u}` : u
}

/** المعالج المشترك لكل أحداث الدفق — يستخدمه لوحة الدردشة ووضع البرمجة معًا */
export function handleChatEvent(e: SSEvent): void {
  switch (e.type) {
    case 'coding_start': {
      const ev = e as unknown as { project?: string; request?: string; mode?: string; element?: unknown; root?: string | null; live?: { code: string; url: string } }
      const st = useApp.getState()
      const editing = ev.mode === 'edit' || ev.mode === 'propose'
      st.setEditPend(null)
      // الاستوديو الجديد هو الواجهة الموحدة: لا تفتح CodingMode فوقه
      // ولوح الكود الحي بجانب المحادثة يغني عن غطاء ملء الشاشة أثناء البناء
      if (!st.studioIDEOpen && !st.railOpen) {
        st.enterCodingMode(ev.project || 'الموقع الجديد', editing ? 'edit' : 'build', ev.request || '')
      }
      if (ev.mode === 'build' && ev.live) st.setCodingLive(ev.live)
      st.setCodingProjectFolder(ev.root || null)
      // افتح لوح الكود الحي بجانب المحادثة لحظيًا
      st.resetLive()
      st.setRailSession(true)
      st.setRailDone(false)
      st.setRailOpen(true)
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
        if (!st.deployUrl && ev.project.url) st.setDeployState('done', abs(ev.project.url), null)
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
      st.setDeployState('done', abs(ev.url), null)
      if (ev.url && st.codingOpen) st.pushCodeAction({ kind: 'ok', text: `الرابط حي ✓ ${abs(ev.url)}` })
      break
    }
    case 'live_link': {
      const ev = e as unknown as { url?: string }
      const st = useApp.getState()
      st.setDeployState('done', abs(ev.url), null)
      if (ev.url && st.codingOpen) st.pushCodeAction({ kind: 'ok', text: `رابطك الفوري جاهز: ${abs(ev.url)}` })
      if (ev.url) st.pushToast({ kind: 'success', title: 'موقعك أصبح حيًا! 🚀', message: abs(ev.url) || '' })
      // بطاقة الرابط داخل المحادثة نفسها — لا تضيع في التنبيهات
      if (ev.url) {
        const full = abs(ev.url) || ev.url
        st.addAssistantMsg(`🚀 **موقعك حي الآن!**\n[افتح موقعك المباشر 🚀](${full})\n${full}`, 'Coding')
      }
      void st.refreshProjects()
      break
    }
    case 'deploy_done': {
      const ev = e as unknown as { url?: string; repoUrl?: string }
      const st = useApp.getState()
      st.setDeployState('done', abs(ev.url), null)
      st.pushCodeAction({ kind: 'ok', text: `نُشر الموقع على رابطك: ${abs(ev.url)}` })
      st.pushToast({ kind: 'success', title: 'موقعك أصبح حيًا! 🚀', message: abs(ev.url) || '' })
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
      if (ev.file && (ev.action === 'open' || ev.action === 'edit')) {
        const st = useApp.getState()
        if (!st.codeFiles.some((f) => f.path === ev.file)) st.upsertCodeFile(ev.file)
      }
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
          if (t.startsWith('⛔') || t.startsWith('❌')) {
            st.pushCodeAction({ kind: 'err', text: t.replace(/^[⛔❌]\s*/, '') })
            st.setTermOpen(true)
            st.pushTerm({ kind: 'err', text: t.replace(/^[⛔❌]\s*/, '') + '\n' })
          }
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
      st.setRailDone(true)
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
    case 'agent_state': {
      const ev = e as unknown as { state?: string; reason?: string; label?: string }
      const st = useApp.getState()
      if (ev.state) {
        st.setAgentState(ev.state)
        const labels: Record<string, string> = {
          PLANNING: '🧠 يخطط…',
          WAITING_APPROVAL: '⏸️ ينتظر موافقتك…',
          EXECUTING: '⚙️ ينفّذ…',
          BUILDING: '🏗️ يبني…',
          TESTING: '🧪 يختبر…',
          FIXING: '🔧 يُصلح…',
          READY: '✅ جاهز',
          FAILED: '❌ فشل',
          STOPPED: '⏹️ متوقف',
          IDLE: '',
        }
        const msg = labels[ev.state]
        if (msg) st.pushActivity({ agent: 'Core', message: ev.reason ? `${msg} — ${ev.reason}` : msg, status: ev.state === 'FAILED' ? 'error' : ev.state === 'STOPPED' ? 'info' : 'running' })
      }
      break
    }
    case 'ack': {
      // إقرار فوري: "حاضر سيدي" + فتح مسرح البناء لحظيًا قبل وصول أول توكن
      const ev = e as unknown as { agent?: string; coding?: boolean }
      const st = useApp.getState()
      const who = ev.agent || 'Ghennai'
      st.pushActivity({ agent: who, message: '🫡 حاضر سيدي — بدأت التنفيذ فورًا', status: 'running' })
      if (st.codingVoice) {
        try { speakText('حاضر سيدي — بدأتُ التنفيذَ فورًا، وسترى الكودَ يُكتب أمامك', uiLang(), undefined, voiceFor('Coding')) } catch { /* الصوت اختياري */ }
      }
      if (ev.coding && !st.codingOpen && !st.studioIDEOpen) {
        // لا غطاء ملء الشاشة: لوح الكود بجانب المحادثة هو المسرح
        st.resetLive()
        st.setRailSession(true)
        st.setRailDone(false)
        st.setRailOpen(true)
      }
      break
    }
    case 'build_stage': {
      // مراحل البناء الحقيقية من آلة الحالة — تُعرض كنقاط إنجاز لا كنسبة وهمية
      const ev = e as unknown as { root?: string; state?: string; stages?: { id: string; label: string; status: 'idle' | 'active' | 'done' | 'failed' }[] }
      const st = useApp.getState()
      if (Array.isArray(ev.stages)) {
        st.setBuildStages(ev.stages, ev.state || '')
        const active = ev.stages.find((s) => s.status === 'active')
        if (active) st.pushActivity({ agent: 'Coding', message: `✓ ${active.label}…`, status: 'running' })
        if (ev.state === 'COMPLETED') st.pushActivity({ agent: 'Coding', message: '✓ الموقع جاهز — كل البوابات خضراء', status: 'success' })
        if (ev.state === 'FAILED') st.pushActivity({ agent: 'Coding', message: '✗ فشل البناء — راجع السبب المعلن', status: 'error' })
      }
      break
    }
    case 'qa_report': {
      const ev = e as unknown as { pass?: number; fail?: number; ok?: boolean; shots?: boolean; consoleErrors?: string[] }
      const st = useApp.getState()
      st.pushCodeAction({ kind: ev.ok ? 'ok' : 'info', text: ev.ok ? `فحص المتصفح: ${ev.pass} ناجح ✓${ev.shots ? ' + لقطتان' : ''}` : `فحص المتصفح: ${ev.fail} مشكلة — تُشخَّص وتُصلح` })
      st.pushActivity({ agent: 'QA', message: ev.ok ? `🧪 المتصفح: ${ev.pass} ✓ بلا حرجة` : `🧪 المتصفح: ${ev.fail} تحتاج إصلاحًا`, status: ev.ok ? 'success' : 'running' })
      if (ev.consoleErrors?.length) st.pushTerm({ kind: 'err', text: `console: ${ev.consoleErrors[0]}\n` })
      break
    }
    case 'approval_requested': {
      const ev = e as unknown as { id: number; tool?: string; command?: string; cwd?: string; path?: string; reason?: string; kind?: string }
      const st = useApp.getState()
      if (typeof ev.id === 'number') {
        st.upsertApproval({ id: ev.id, tool: ev.tool || 'terminal', command: ev.command ?? null, cwd: ev.cwd ?? null, path: ev.path ?? null, reason: ev.reason || '', kind: ev.kind ?? null, ts: Date.now() })
        st.pushActivity({ agent: 'Core', message: `⏸️ يطلب موافقتك: ${(ev.command || ev.path || ev.tool || '').toString().slice(0, 80)}`, status: 'info' })
        st.pushToast({ kind: 'info', title: 'موافقة مطلوبة ⏸️', message: (ev.reason || ev.command || '').toString().slice(0, 120) })
      }
      break
    }
    case 'approval_resolved': {
      const ev = e as unknown as { id: number; decision?: string }
      const st = useApp.getState()
      if (typeof ev.id === 'number') st.removeApproval(ev.id)
      break
    }
    case 'brief_questions': {
      const st = useApp.getState()
      st.pushActivity({ agent: 'Coding', message: '❓ أسئلة توضيح سريعة — أجب ليبدأ البناء فورًا', status: 'info' })
      st.pushToast({ kind: 'info', title: 'سؤال سريع قبل البناء ❓', message: 'أجب باختصار وسيبدأ البناء فورًا' })
      break
    }
    case 'preview_started': {
      const ev = e as unknown as { id?: string; port?: number; command?: string; cwd?: string }
      const st = useApp.getState()
      if (ev.id) {
        const tok = localStorage.getItem('ghennai_token')
        st.setPreview(`/api/preview/p/${encodeURIComponent(ev.id)}/?token=${encodeURIComponent(tok || '')}`)
        st.pushCodeAction({ kind: 'ok', text: `👁️ معاينة حية نشطة :${ev.port ?? ''} — ${ev.command || ''}` })
        st.pushActivity({ agent: 'Preview', message: `👁️ خادم المعاينة يعمل :${ev.port ?? ''}`, status: 'success' })
        st.pushToast({ kind: 'success', title: 'المعاينة الحية تعمل 👁️', message: `المنفذ ${ev.port ?? ''}` })
      }
      break
    }
    case 'preview_stopped': {
      const ev = e as unknown as { id?: string; reason?: string; code?: number }
      const st = useApp.getState()
      st.pushCodeAction({ kind: 'info', text: `⏹️ توقفت المعاينة — ${ev.reason || ''}` })
      st.pushActivity({ agent: 'Preview', message: `⏹️ توقفت المعاينة — ${ev.reason || ''}`, status: 'info' })
      break
    }
    case 'preview_log': {
      const ev = e as unknown as { kind?: string; text?: string }
      const st = useApp.getState()
      const kind = ev.kind === 'err' ? 'err' : ev.kind === 'cmd' ? 'cmd' : 'out'
      st.setTermOpen(true)
      st.pushTerm({ kind, text: String(ev.text || '') })
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