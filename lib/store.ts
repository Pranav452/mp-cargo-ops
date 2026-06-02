/**
* Storage layer — uses local JSON file when KV env vars are absent (local dev),
* falls back to Vercel KV in production.
*/
import type { AppState, Container, EmailDraft, TaskRun } from '@/types'
import path from 'path'
import fs from 'fs'
 
const STATE_KEY = 'mp-cargo:state'
const RUNS_KEY = 'mp-cargo:runs'
 
const DEFAULT_STATE: AppState = {
  containers: [],
  drafts: [],
  lastRun: null,
  updatedAt: new Date().toISOString(),
  seenThreads: {},
}
 
// ─── Detect environment ───────────────────────────────────────────────────────
 
function useKV(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
}
 
// ─── Local file store (dev only) ─────────────────────────────────────────────
 
const DATA_DIR = path.join(process.cwd(), '.local-data')
const STATE_FILE = path.join(DATA_DIR, 'state.json')
const RUNS_FILE = path.join(DATA_DIR, 'runs.json')
 
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}
 
function readFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}
 
function writeFile(filePath: string, data: unknown) {
  ensureDataDir()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}
 
// ─── KV store (production) ────────────────────────────────────────────────────
 
async function kvGet<T>(key: string): Promise<T | null> {
  const { kv } = await import('@vercel/kv')
  return kv.get<T>(key)
}
 
async function kvSet(key: string, value: unknown): Promise<void> {
  const { kv } = await import('@vercel/kv')
  await kv.set(key, value)
}
 
// ─── Public API ───────────────────────────────────────────────────────────────
 
export async function getState(): Promise<AppState> {
  if (useKV()) {
    try {
      const state = await kvGet<AppState>(STATE_KEY)
      return state ?? DEFAULT_STATE
    } catch {
      return DEFAULT_STATE
    }
  }
  return readFile<AppState>(STATE_FILE, DEFAULT_STATE)
}
 
export async function saveState(state: AppState): Promise<void> {
  const updated = { ...state, updatedAt: new Date().toISOString() }
  if (useKV()) {
    await kvSet(STATE_KEY, updated)
  } else {
    writeFile(STATE_FILE, updated)
  }
}
 
export async function updateContainers(containers: Container[]): Promise<void> {
  const state = await getState()
  const existing = new Map(state.containers.map((c) => [c.container, c]))
  for (const c of containers) {
    existing.set(c.container, { ...existing.get(c.container), ...c })
  }
  await saveState({ ...state, containers: Array.from(existing.values()) })
}
 
export async function getDrafts(): Promise<EmailDraft[]> {
  const state = await getState()
  return state.drafts
}
 
export async function addDraft(draft: EmailDraft): Promise<void> {
  const state = await getState()
  const filtered = state.drafts.filter(
    (d) => !(d.container === draft.container && d.type === draft.type && d.status === 'pending_review')
  )
  await saveState({ ...state, drafts: [...filtered, draft] })
}
 
export async function updateDraft(
  draftId: string,
  update: Partial<EmailDraft>
): Promise<void> {
  const state = await getState()
  const drafts = state.drafts.map((d) =>
    d.id === draftId ? { ...d, ...update } : d
  )
  await saveState({ ...state, drafts })
}
 
export async function updateSeenThreads(newSeen: Record<string, string>): Promise<void> {
  const state = await getState()
  const merged = { ...(state.seenThreads ?? {}), ...newSeen }
  await saveState({ ...state, seenThreads: merged })
}

export async function getSeenThreads(): Promise<Record<string, string>> {
  const state = await getState()
  return state.seenThreads ?? {}
}

export async function saveTaskRun(run: TaskRun): Promise<void> {
  const state = await getState()
  await saveState({ ...state, lastRun: run })
 
  let runs: TaskRun[]
  if (useKV()) {
    runs = (await kvGet<TaskRun[]>(RUNS_KEY)) ?? []
    runs.unshift(run)
    await kvSet(RUNS_KEY, runs.slice(0, 10))
  } else {
    runs = readFile<TaskRun[]>(RUNS_FILE, [])
    runs.unshift(run)
    writeFile(RUNS_FILE, runs.slice(0, 10))
  }
}
 
export async function getRunHistory(): Promise<TaskRun[]> {
  if (useKV()) {
    return (await kvGet<TaskRun[]>(RUNS_KEY)) ?? []
  }
  return readFile<TaskRun[]>(RUNS_FILE, [])
}
 
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}