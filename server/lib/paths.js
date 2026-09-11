import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const SERVER_DIR = __dirname
export const ROOT_DIR = path.resolve(SERVER_DIR, '..')
export const WORKSPACE_DIR = path.join(ROOT_DIR, 'workspace')

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true })
}

export function userWorkspace(email) {
  const safe = String(email || 'guest').replace(/[^a-zA-Z0-9@._-]/g, '_')
  const dir = path.join(WORKSPACE_DIR, safe)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function safeResolve(base, target) {
  const resolved = path.resolve(base, target)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error(`الوصول خارج مساحة العمل مرفوض: ${target}`)
  }
  return resolved
}