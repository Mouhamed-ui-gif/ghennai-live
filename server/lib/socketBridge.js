import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { setSocketBroadcaster } from './events.js'

let io = null

/** ربط قناة المحادثة اللحظية (socket.io) بخادم HTTP الحالي */
export function bindSocket(server) {
  if (io) return io
  io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      const payload = jwt.verify(token || '', process.env.JWT_SECRET || 'dev-secret')
      if (!payload || !payload.email) throw new Error('bad token')
      socket.data.email = payload.email
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    socket.join(socket.data.email)
    socket.emit('connected', { user: socket.data.email, ts: Date.now() })
    socket.on('disconnect', () => { /* noop */ })
  })

  setSocketBroadcaster((email, payload) => {
    io.to(email).emit(payload.type, payload)
  })

  return io
}