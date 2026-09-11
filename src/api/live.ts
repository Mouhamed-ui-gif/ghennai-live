import { io, type Socket } from 'socket.io-client'
import { getToken } from './client'

export interface LiveEvent {
  type: string
  ts?: number
  [k: string]: unknown
}

type LiveHandler = (e: LiveEvent) => void
type Status = 'off' | 'connecting' | 'on'

let socket: Socket | null = null
const handlers = new Set<LiveHandler>()
const statusCbs = new Set<(s: Status) => void>()
let status: Status = 'off'

/** توصيل قناة المحادثة اللحظية (socket.io) — بجوار SSE، لا بديل عنه */
export function initLive(): Socket | null {
  if (socket) return socket
  const token = getToken()
  if (!token) return null
  socket = io({ auth: { token }, transports: ['websocket', 'polling'] })
  socket.on('connect', () => { status = 'on'; for (const cb of statusCbs) cb(status) })
  socket.on('disconnect', () => { status = 'connecting'; for (const cb of statusCbs) cb(status) })
  socket.on('connect_error', () => { status = 'off'; for (const cb of statusCbs) cb(status) })
  socket.onAny((event, payload) => {
    const e: LiveEvent = { type: event, ...(payload || {}) }
    for (const h of handlers) h(e)
  })
  return socket
}

export function closeLive() {
  socket?.disconnect()
  socket = null
  status = 'off'
  for (const cb of statusCbs) cb(status)
}

export function onLive(h: LiveHandler): () => void {
  handlers.add(h)
  return () => handlers.delete(h)
}

export function onLiveStatus(cb: (s: Status) => void): () => void {
  statusCbs.add(cb)
  cb(status)
  return () => statusCbs.delete(cb)
}

export function liveConnected(): boolean {
  return status === 'on'
}