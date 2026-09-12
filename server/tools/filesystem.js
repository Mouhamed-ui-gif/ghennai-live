import fs from 'fs'
import path from 'path'
import { safeResolve } from '../lib/paths.js'

function ensureInWorkspace(workspace, target) {
  return safeResolve(workspace, target)
}

const filesystem = {
  async writeFile({ workspace, path: filePath, content }) {
    const abs = ensureInWorkspace(workspace, filePath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content ?? '', 'utf-8')
    return { ok: true, path: filePath }
  },

  async readFile({ workspace, path: filePath }) {
    const abs = ensureInWorkspace(workspace, filePath)
    const content = fs.readFileSync(abs, 'utf-8')
    return { ok: true, path: filePath, content, length: content.length }
  },

  async appendFile({ workspace, path: filePath, content }) {
    const abs = ensureInWorkspace(workspace, filePath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.appendFileSync(abs, content ?? '', 'utf-8')
    return { ok: true, path: filePath }
  },

  async replaceInFile({ workspace, path: filePath, old: oldText, new: newText, replaceAll = false }) {
    const abs = ensureInWorkspace(workspace, filePath)
    if (!fs.existsSync(abs)) return { ok: false, error: 'الملف غير موجود' }
    const oldStr = oldText ?? ''
    const newStr = newText ?? ''
    if (oldStr === '') return { ok: false, error: 'old مطلوب — يجب تحديد النص المراد استبداله' }
    const content = fs.readFileSync(abs, 'utf-8')
    const count = content.split(oldStr).length - 1
    if (count === 0) return { ok: false, error: 'النص المطلوب تغييره غير موجود في الملف — اقرأ الملف أولاً ثم استخدم النص الحرفي الموجود' }
    const updated = replaceAll ? content.split(oldStr).join(newStr) : content.replace(oldStr, newStr)
    fs.writeFileSync(abs, updated, 'utf-8')
    return { ok: true, path: filePath, replaced: count, offset: content.indexOf(oldStr) }
  },

  async deleteFile({ workspace, path: filePath }) {
    const abs = ensureInWorkspace(workspace, filePath)
    fs.rmSync(abs, { force: true })
    return { ok: true, path: filePath, deleted: true }
  },

  async listDir({ workspace, path: dirPath = '.' }) {
    const abs = ensureInWorkspace(workspace, dirPath)
    if (!fs.existsSync(abs)) return { ok: false, error: 'المجلد غير موجود' }
    const entries = fs.readdirSync(abs, { withFileTypes: true }).map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : e.isSymbolicLink() ? 'link' : 'file',
    }))
    return { ok: true, path: dirPath, entries }
  },

  async mkDir({ workspace, path: dirPath }) {
    const abs = ensureInWorkspace(workspace, dirPath)
    fs.mkdirSync(abs, { recursive: true })
    return { ok: true, path: dirPath }
  },

  async tree({ workspace, path: dirPath = '.', depth = 3 }) {
    const abs = ensureInWorkspace(workspace, dirPath)
    function walk(dir, level, prefix) {
      if (level < 0) return []
      const rows = []
      const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        const rel = path.join(prefix, e.name)
        rows.push({ name: rel, type: e.isDirectory() ? 'dir' : 'file' })
        if (e.isDirectory()) rows.push(...walk(path.join(dir, e.name), level - 1, rel))
      }
      return rows
    }
    const rows = walk(abs, depth, '')
    return { ok: true, tree: rows }
  },
}

export default filesystem