import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { userWorkspace } from './paths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = path.resolve(__dirname, '..', 'templates')

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

export async function seedTemplates(email) {
  const ws = userWorkspace(email)
  const target = path.join(ws, '_ghennai', 'templates')
  try {
    if (!fs.existsSync(TEMPLATE_DIR)) return { ok: false, copied: 0, reason: 'no template kit on server' }
    const entries = fs.readdirSync(TEMPLATE_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())
    let copied = 0
    for (const e of entries) {
      const dest = path.join(target, e.name)
      if (fs.existsSync(dest)) continue
      copyDir(path.join(TEMPLATE_DIR, e.name), dest)
      copied++
    }
    return { ok: true, copied, dir: target }
  } catch (err) {
    return { ok: false, reason: String(err.message || err) }
  }
}