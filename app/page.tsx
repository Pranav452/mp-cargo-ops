'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { AppState, Container } from '@/types'
import { ContainerTable } from '@/components/ContainerTable'
import { ActionItems } from '@/components/ActionItems'
import { StatusKPIs } from '@/components/StatusKPIs'
import { RunStatus } from '@/components/RunStatus'
import { ComposeModal } from '@/components/ComposeModal'

// ─── Live Task Log ────────────────────────────────────────────────────────────

interface LogLine { ts: string; level: string; msg: string }

const LOG_COLORS: Record<string, string> = {
  step: '#60a5fa', ok: '#4ade80', warn: '#fbbf24', error: '#f87171', info: '#94a3b8',
}

function LiveLog({ running }: { running: boolean }) {
  const [lines, setLines] = useState<LogLine[]>([])
  const [active, setActive] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!running && !active) return
    const poll = setInterval(async () => {
      try {
        const res = await fetch('/api/logs')
        const data = await res.json()
        setLines(data.lines ?? [])
        setActive(data.active)
        if (!data.active) clearInterval(poll)
      } catch {}
    }, 800)
    return () => clearInterval(poll)
  }, [running, active])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  if (!running && !active && lines.length === 0) return null

  return (
    <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 10, marginTop: 16, overflow: 'hidden' }}>
      <div style={{ padding: '8px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', display: 'inline-block', background: active ? '#4ade80' : '#6b7280', boxShadow: active ? '0 0 6px #4ade80' : 'none' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#8b949e', letterSpacing: 0.5 }}>{active ? 'RUNNING' : 'COMPLETED'} — Task Log</span>
      </div>
      <div style={{ fontFamily: 'SF Mono, Fira Code, monospace', fontSize: 12, lineHeight: 1.7, padding: '12px 16px', maxHeight: 320, overflowY: 'auto', color: '#c9d1d9' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 14 }}>
            <span style={{ color: '#484f58', minWidth: 70, fontSize: 10, paddingTop: 2 }}>
              {new Date(l.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span style={{ color: LOG_COLORS[l.level] ?? '#94a3b8' }}>{l.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [state, setState] = useState<AppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'summary' | 'containers' | 'noa'>('summary')
  const [composing, setComposing] = useState(false)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state')
      const data = await res.json()
      setState(data)
    } catch (e) {
      console.error('Failed to fetch state:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 60_000)
    return () => clearInterval(interval)
  }, [fetchState])

  const handleManualRun = async () => {
    const secret = prompt('Enter CRON_SECRET to trigger manual run:')
    if (!secret) return
    setRunning(true)
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchState()
        alert('Run completed successfully.')
      } else {
        alert('Run failed: ' + (data.run?.error ?? 'Unknown error'))
      }
    } catch (e) {
      alert('Request failed: ' + e)
    } finally {
      setRunning(false)
    }
  }

  const noaContainers = state?.containers.filter((c) => !c.noaToGilles && c.status !== 'upcoming') ?? []
  const pendingDrafts = state?.drafts.filter((d) => d.status === 'pending_review').length ?? 0

  const tabs = [
    { key: 'summary' as const, label: 'Summary' },
    { key: 'containers' as const, label: 'All Containers' },
    { key: 'noa' as const, label: `NOA Pending${noaContainers.length ? ` (${noaContainers.length})` : ''}` },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Nav ── */}
      <header style={{
        background: '#111', color: '#fff',
        padding: '0 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, height: 56,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <polyline points="16 2 12 7 8 2"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: 0.3 }}>MP Cargo</span>
        </div>

        {/* Nav tabs */}
        <nav style={{ display: 'flex', gap: 4 }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                border: 'none',
                background: activeTab === t.key ? '#fff' : 'transparent',
                color: activeTab === t.key ? '#111' : '#888',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {state?.updatedAt && (
            <span style={{ fontSize: 11, color: '#666' }}>
              Updated {new Date(state.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={fetchState} style={{ background: '#1e1e1e', border: '1px solid #333', color: '#aaa', padding: '5px 12px', borderRadius: 7, fontSize: 12 }}>
            ↻
          </button>
          <button onClick={() => setComposing(true)} style={{ background: '#1e1e1e', border: '1px solid #333', color: '#aaa', padding: '5px 13px', borderRadius: 7, fontSize: 12 }}>
            ✉ Compose
          </button>
          <a href="/drafts" style={{
            background: pendingDrafts > 0 ? '#fff' : '#1e1e1e',
            border: '1px solid #333',
            color: pendingDrafts > 0 ? '#111' : '#aaa',
            padding: '5px 13px', borderRadius: 7, fontSize: 12, fontWeight: pendingDrafts > 0 ? 600 : 400,
            textDecoration: 'none', display: 'inline-block',
          }}>
            Drafts{pendingDrafts > 0 ? ` (${pendingDrafts})` : ''}
          </a>
          <button
            onClick={handleManualRun}
            disabled={running}
            style={{
              background: running ? '#333' : '#fff', color: running ? '#888' : '#111',
              border: 'none', padding: '6px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600,
              cursor: running ? 'default' : 'pointer',
            }}
          >
            {running ? 'Running…' : '▶ Run Now'}
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main style={{ padding: '24px 28px', maxWidth: 1440, margin: '0 auto' }}>

        {/* Sub-header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
            Ops Dashboard
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Antwerp Import · mpcargolille@gmail.com</p>
        </div>

        <LiveLog running={running} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>◌</div>
            Loading…
          </div>
        ) : !state ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-faint)' }}>
            No data yet. Hit <strong>Run Now</strong> to execute the first task.
          </div>
        ) : (
          <>
            {activeTab === 'summary' && (
              <>
                <StatusKPIs containers={state.containers} />
                <RunStatus run={state.lastRun} />
                <ActionItems containers={state.containers} />
              </>
            )}
            {activeTab === 'containers' && (
              <ContainerTable containers={state.containers} />
            )}
            {activeTab === 'noa' && (
              <NOAPendingPanel containers={noaContainers} allContainers={state.containers} />
            )}
          </>
        )}
      </main>

      {composing && <ComposeModal onClose={() => setComposing(false)} />}
    </div>
  )
}

// ─── NOA Panel ────────────────────────────────────────────────────────────────

function NOAPendingPanel({ containers, allContainers }: { containers: Container[]; allContainers: Container[] }) {
  const sent = allContainers.filter((c) => c.noaToGilles)
  const [drafting, setDrafting] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [draftMsg, setDraftMsg] = useState<Record<string, string>>({})

  const draftNOA = async (container: Container) => {
    setDrafting((p) => ({ ...p, [container.container]: 'loading' }))
    setDraftMsg((p) => ({ ...p, [container.container]: '' }))
    try {
      const res = await fetch('/api/draft-noa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container: container.container, mbl: container.mbl }),
      })
      const data = await res.json()
      if (data.success) {
        setDrafting((p) => ({ ...p, [container.container]: 'done' }))
        setDraftMsg((p) => ({ ...p, [container.container]: 'Draft created — check Drafts tab' }))
      } else {
        setDrafting((p) => ({ ...p, [container.container]: 'error' }))
        setDraftMsg((p) => ({ ...p, [container.container]: data.error ?? 'Failed' }))
      }
    } catch (e) {
      setDrafting((p) => ({ ...p, [container.container]: 'error' }))
      setDraftMsg((p) => ({ ...p, [container.container]: String(e) }))
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Pending */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-faint)', marginBottom: 12 }}>
          Instruction Douane Pending ({containers.length})
        </div>
        {containers.length === 0 ? (
          <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)' }}>All containers have NOA sent to Gilles.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {containers.map((c) => {
              const st = drafting[c.container] ?? 'idle'
              const msg = draftMsg[c.container] ?? ''
              return (
                <div key={c.container} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{c.container}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.mbl !== 'unknown' ? c.mbl : '—'} · {c.carrier}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastAction}</div>
                    {msg && <div style={{ fontSize: 11, marginTop: 4, color: st === 'error' ? '#b91c1c' : '#15803d', fontWeight: 500 }}>{msg}</div>}
                  </div>
                  <button
                    onClick={() => draftNOA(c)}
                    disabled={st === 'loading' || st === 'done'}
                    className={st === 'idle' || st === 'error' ? 'btn-primary' : 'btn-ghost'}
                    style={{ flexShrink: 0, fontSize: 11, padding: '5px 13px' }}
                  >
                    {st === 'loading' ? 'Searching…' : st === 'done' ? 'Drafted ✓' : st === 'error' ? 'Retry' : 'Draft NOA'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sent */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-faint)', marginBottom: 12 }}>
          Instruction Douane Sent ({sent.length})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sent.map((c) => (
            <div key={c.container} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12 }}>{c.container}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.mbl} · {c.carrier}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{c.lastAction}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '2px 8px', flexShrink: 0 }}>Sent</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
