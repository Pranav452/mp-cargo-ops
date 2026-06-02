export interface LogLine {
  ts: string
  level: 'info' | 'step' | 'ok' | 'warn' | 'error'
  msg: string
}

const MAX = 500

let lines: LogLine[] = []
let active = false

export function logStart() {
  lines = []
  active = true
}

export function logEnd() {
  active = false
}

export function log(msg: string, level: LogLine['level'] = 'info') {
  lines.push({ ts: new Date().toISOString(), level, msg })
  if (lines.length > MAX) lines.shift()
  console.log(`[Task] ${msg}`)
}

export function getLogs(): { lines: LogLine[]; active: boolean } {
  return { lines: [...lines], active }
}
