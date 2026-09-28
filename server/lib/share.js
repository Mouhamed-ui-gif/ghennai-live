import { ensureProject, setProjectMeta, shareCodeInUse, findByShareCode } from './projects.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// أحرف لا لبس فيها (بلا i/l/o/0/1) لرابطة أقصر وأسهل قراءة
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

function randCode(len = 8) {
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}

export function newShareCode(len = 8) {
  let code = randCode(len)
  while (shareCodeInUse(code)) code = randCode(len)
  return code
}

/** يضمن وجود كود نشر فوري للمشروع (مسار root) ويعيد السجل مع رابط /live النسبي */
export function ensureShare(email, root, name) {
  const p = ensureProject(email, root, name)
  if (p.code && p.url) return { code: p.code, url: p.url, project: p }
  const code = newShareCode()
  const url = `/live/${code}/`
  const saved = setProjectMeta(email, p.id, { code, url, shareAt: Date.now() })
  return { code: saved.code, url: saved.url, project: saved }
}

export function shareRoot(code) {
  return findByShareCode(code)
}

export const shareCodeValid = (code) => /^[a-z0-9]{6,12}$/i.test(String(code || ''))

const __dir = path.dirname(fileURLToPath(import.meta.url))

/** القاعدة العامة للروابط: PUBLIC_URL ← RENDER_EXTERNAL_URL ← رابط التونل الحي (< 10 دقائق) ← '' (نسبي) */
export function publicBase() {
  const env = String(process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '')
  if (env) return env
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dir, '..', 'data', 'tunnel.json'), 'utf8'))
    // التونل الميت أسوأ من النسبي: تجاهل أي رابط أقدم من 10 دقائق
    if (Date.now() - Number(j?.updatedAt || 0) > 10 * 60 * 1000) return ''
    const u = String(j?.url || '').trim().replace(/\/+$/, '')
    if (/^https?:\/\//i.test(u)) return u
  } catch { /* لا تونل — نسبي */ }
  return ''
}

/** رابط عام كامل من مسار نسبي (/live/xxxx/ → https://…/live/xxxx/ أو يبقى نسبيًا) */
export function publicUrl(rel) {
  const r = String(rel || '')
  const b = publicBase()
  if (!b) return r
  return r.startsWith('/') ? `${b}${r}` : `${b}/${r}`
}