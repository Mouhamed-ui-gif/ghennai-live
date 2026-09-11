const clients = new Set()

// طلبات شات نشطة لكل مستخدم — تُتلقى بُرُود الأحداث بالإضافة إلى بث SSE العام
const requestSinks = new Map()

// جسر WebSocket (socket.io): يُبثّ له كل حدث صدور إضافيًا لقناة SSE
let socketBroadcaster = null
export function setSocketBroadcaster(fn) {
  socketBroadcaster = fn
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export function attachSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write(': connected\n\n')
  const client = { res, email: req.user?.email }
  clients.add(client)

  req.on('close', () => clients.delete(client))
  return client
}

export function broadcast(event) {
  const payload = { ...event, ts: Date.now() }
  for (const client of clients) {
    try { sseSend(client.res, payload) } catch { /* noop */ }
  }
}

export function broadcastTo(email, event) {
  const payload = { ...event, ts: Date.now() }
  for (const client of clients) {
    if (client.email === email) {
      try { sseSend(client.res, payload) } catch { /* noop */ }
    }
  }
}

/** ربط بثّ جلسة شات نشطة: كل حدث يُبث لهذا البريد يصل إلى sink أيضًا */
export function bindRequestStream(email, sink) {
  if (!requestSinks.has(email)) requestSinks.set(email, new Set())
  requestSinks.get(email).add(sink)
  return () => {
    const s = requestSinks.get(email)
    if (s) {
      s.delete(sink)
      if (!s.size) requestSinks.delete(email)
    }
  }
}

/** إصدار حدث لمستخدم معيّن: يُبث لقناة SSE العامة ولطلبات الشات النشطة وWebSocket socket.io */
export function emitUser(email, event) {
  const payload = { ...event, ts: Date.now() }
  broadcastTo(email, payload)
  const sinks = requestSinks.get(email)
  if (sinks) for (const sink of sinks) sink(payload)
  if (socketBroadcaster) {
    try {
      socketBroadcaster(email, payload)
    } catch { /* noop */ }
  }
}

export function emitStep({ email, agent, tool, message, status, data }) {
  emitUser(email, { type: 'agent_event', agent, tool, message, status, data })
}