import fs from 'fs'
import path from 'path'
import { safeResolve } from '../lib/paths.js'
import { Memory } from '../lib/db.js'

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '.next', '.vite'])

/** بحث في ملفات مساحة العمل (وكيل يبحث داخل المشروع) */
async function searchFiles({ workspace, query, limit = 12 }) {
  const root = safeResolve(workspace, '.')
  if (!fs.existsSync(root)) return { ok: false, error: 'workspace missing' }
  const hits = []
  const walk = (dir, depth) => {
    if (depth > 5 || hits.length >= limit) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.') || IGNORE.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, depth + 1)
      else if (e.isFile() && e.name.toLowerCase().match(/\.(html?|css|js|jsx|ts|tsx|md|txt|json|py|go|rs|java|c|h|cpp|mdx)$/)) {
        try {
          const content = fs.readFileSync(full, 'utf-8')
          if (content.includes(query)) {
            const lines = content.split('\n')
            for (let i = 0; i < lines.length && hits.length < limit; i++) {
              if (lines[i].includes(query)) {
                hits.push({ path: safeResolve(workspace, full).replace(root + '/', ''), line: i + 1, snippet: lines[i].trim().slice(0, 160) })
              }
            }
          }
        } catch { /* skip binary/unreadable */ }
      }
    }
  }
  walk(root, 0)
  return hits.length ? { ok: true, hits } : { ok: true, hits: [], note: 'لا توجد نتائج' }
}

/** بحث في الذاكرة: مشاريع سابقة + سياقات الوكلاء في هذه الجلسة */
async function searchMemory({ user_email, query, limit = 10 }) {
  try {
    const out = []
    for (const scope of [['project', 'project'], ['agent_ctx', 'session'], ['session', 'session'], ['last_request', 'last']]) {
      const rows = Memory.search({ scope: scope[0], user_email, limit: 80 })
      for (const r of rows) {
        const blob = JSON.stringify(r.value)
        if (blob.toLowerCase().includes(String(query).toLowerCase())) {
          out.push({ scope: scope[1], key: r.key, snippet: blob.slice(0, 200) })
        }
      }
      if (out.length >= limit) break
    }
    return out.length ? { ok: true, results: out } : { ok: true, results: [], note: 'لا نتائج في الذاكرة' }
  } catch {
    return { ok: false, error: 'memory search failed' }
  }
}

const searchTools = { searchFiles, searchMemory }

export default searchTools