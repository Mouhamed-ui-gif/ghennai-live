import { getToken } from './client'
import type { SSEvent } from './client'

type Listener = (e: SSEvent) => void

const listeners = new Set<Listener>()
let es: EventSource | null = null
let attempting = false

export function onGlobalEvent(fn: Listener) {
  listeners.add(fn)
  ensure()
  return () => listeners.delete(fn)
}

function ensure() {
  const token = getToken()
  if (!token || es || attempting) return
  attempting = true
  es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`)
  es.onmessage = (ev) => {
    try {
      const e = JSON.parse(ev.data) as SSEvent
      listeners.forEach((fn) => fn(e))
    } catch {
      /* noop */
    }
  }
  es.onerror = () => {
    es?.close()
    es = null
    attempting = false
    if (getToken()) setTimeout(ensure, 2500)
  }
  es.onopen = () => {
    attempting = false
  }
}

export function rearmEvents() {
  es?.close()
  es = null
  attempting = false
  if (getToken()) setTimeout(ensure, 300)
}