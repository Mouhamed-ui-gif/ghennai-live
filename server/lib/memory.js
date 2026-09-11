import { Memory, Project, Task, User } from './db.js'

/** حفظ مشروع بعد بنائه أو تعديله */
export function rememberProject(email, name, meta) {
  try {
    Memory.put({ scope: 'project', user_email: email, key: String(name).toLowerCase(), value: meta })
  } catch { /* noop */ }
}

/** استرجاع سياق مشاريع المستخدم السابقة — «العقل المشترك» */
export function contextBlock(email, message) {
  try {
    const rows = Memory.search({ scope: 'project', user_email: email, limit: 12 })
    if (!rows.length) return ''
    const matches = rows.filter((r) => JSON.stringify(r.value) || message)
    const block = matches
      .slice(0, 8)
      .map((r) => `- project "${r.key}": ${JSON.stringify(r.value)}`)
      .join('\n')
    return block ? `\n\n[The user's past projects (Shared Mind). Use these when asked to modify/reference "the site I built before". If user asks about an old project, find it here]:\n${block}` : ''
  } catch {
    return ''
  }
}

export function registerProject(user) {
  try {
    const slug = `u${String(user.email).replace(/[^a-zA-Z0-9]/g, '_')}`
    return Project.create({ slug, name: user.name || user.email, path: slug, metadata: { email: user.email } })
  } catch { return null }
}

export function logTask({ user, goal, agent, tools = [], result, status, project_id = null }) {
  try {
    return Task.create({ project_id, parent_id: null, goal, agent, tools, deps: [], verification: {}, user_email: user.email })
  } catch { return null }
}