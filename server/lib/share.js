import { ensureProject, setProjectMeta, shareCodeInUse, findByShareCode } from './projects.js'

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

export const shareCodeValid = (code) => /^[a-z0-9]{6,12}$/.test(String(code || ''))