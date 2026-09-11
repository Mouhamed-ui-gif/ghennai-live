const logs = []

export function audit(entry) {
  const rec = {
    time: new Date().toISOString(),
    ...entry,
  }
  logs.unshift(rec)
  if (logs.length > 500) logs.length = 500
  return rec
}

export function getRecent(n = 100) {
  return logs.slice(0, n)
}