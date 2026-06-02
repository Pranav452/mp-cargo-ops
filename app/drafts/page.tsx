'use client'

import { useEffect, useState } from 'react'
import type { EmailDraft } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  instruction_douane: 'Instruction Douane → Gilles',
  release_reminder: 'Release Reminder → CMA',
  urgent_followup: 'Urgent Follow-up → CMA',
}

const STATUS_STYLE: Record<string, { dot: string; label: string }> = {
  pending_review: { dot: '#d97706', label: 'Pending Review' },
  sent:           { dot: '#16a34a', label: 'Sent' },
  rejected:       { dot: '#9ca3af', label: 'Rejected' },
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<EmailDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<EmailDraft | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editSubject, setEditSubject] = useState('')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'pending_review' | 'sent' | 'rejected' | 'all'>('pending_review')

  const fetchDrafts = async () => {
    setLoading(true)
    const res = await fetch('/api/drafts')
    const data = await res.json()
    setDrafts(data.drafts ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchDrafts() }, [])

  const openDraft = (draft: EmailDraft) => {
    setSelected(draft)
    setEditBody(draft.body)
    setEditSubject(draft.subject)
  }

  const doAction = async (action: 'approve' | 'reject' | 'edit') => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/drafts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: selected.id, action, body: editBody, subject: editSubject }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchDrafts()
        setSelected(null)
        if (action === 'approve') alert('Draft sent via Gmail.')
        if (action === 'reject') alert('Draft rejected and removed.')
      } else {
        alert('Action failed: ' + JSON.stringify(data))
      }
    } finally {
      setSaving(false)
    }
  }

  const filtered = filter === 'all' ? drafts : drafts.filter((d) => d.status === filter)
  const pendingCount = drafts.filter((d) => d.status === 'pending_review').length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Nav */}
      <header style={{
        background: '#111', color: '#fff', padding: '0 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100, height: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5">
              <rect x="2" y="7" width="20" height="14" rx="2"/><polyline points="16 2 12 7 8 2"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>MP Cargo</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {pendingCount > 0 && (
            <span style={{ background: '#d97706', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
              {pendingCount} pending
            </span>
          )}
          <button onClick={fetchDrafts} style={{ background: '#1e1e1e', border: '1px solid #333', color: '#aaa', padding: '5px 12px', borderRadius: 7, fontSize: 12 }}>
            ↻ Refresh
          </button>
          <a href="/" style={{ background: '#1e1e1e', border: '1px solid #333', color: '#aaa', padding: '5px 13px', borderRadius: 7, fontSize: 12, textDecoration: 'none', display: 'inline-block' }}>
            ← Dashboard
          </a>
        </div>
      </header>

      <main style={{ padding: '24px 28px', maxWidth: 1440, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Draft Review</h1>
          <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Review and approve generated email drafts before sending</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>

          {/* Left: List */}
          <div>
            {/* Filter */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {(['pending_review', 'sent', 'rejected', 'all'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  border: '1px solid',
                  borderColor: filter === f ? '#111' : 'var(--border)',
                  background: filter === f ? '#111' : '#fff',
                  color: filter === f ? '#fff' : 'var(--text-muted)',
                }}>
                  {{ pending_review: 'Pending', sent: 'Sent', rejected: 'Rejected', all: 'All' }[f]}
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ color: 'var(--text-faint)', padding: 20, textAlign: 'center' }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-faint)' }}>No drafts here.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.map((draft) => {
                  const st = STATUS_STYLE[draft.status] ?? STATUS_STYLE.pending_review
                  return (
                    <button
                      key={draft.id}
                      onClick={() => openDraft(draft)}
                      style={{
                        background: selected?.id === draft.id ? '#f5f5f5' : '#fff',
                        border: `1px solid ${selected?.id === draft.id ? '#111' : 'var(--border)'}`,
                        borderRadius: 10, padding: '12px 14px', textAlign: 'left', width: '100%',
                        cursor: 'pointer', transition: 'all 0.1s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', flex: 1 }}>{TYPE_LABELS[draft.type] ?? draft.type}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                          {new Date(draft.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, marginBottom: 3 }}>{draft.container}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draft.subject}</div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right: Editor */}
          <div>
            {!selected ? (
              <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-faint)' }}>
                Select a draft to review
              </div>
            ) : (
              <div className="card" style={{ overflow: 'hidden' }}>
                {/* Meta */}
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: '#fafafa' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: (STATUS_STYLE[selected.status] ?? STATUS_STYLE.pending_review).dot, display: 'inline-block' }} />
                    {TYPE_LABELS[selected.type]} · <span style={{ fontFamily: 'monospace' }}>{selected.container}</span> · MBL: <span style={{ fontFamily: 'monospace' }}>{selected.mbl}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { label: 'To', value: selected.to.join(', ') },
                      ...(selected.cc.length ? [{ label: 'Cc', value: selected.cc.join(', ') }] : []),
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 24 }}>{label}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{value}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 24 }}>Sub</span>
                      <input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        disabled={selected.status !== 'pending_review'}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: selected.status !== 'pending_review' ? '#f9fafb' : '#fff', outline: 'none', color: 'var(--text)' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Body */}
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  disabled={selected.status !== 'pending_review'}
                  rows={22}
                  style={{
                    width: '100%', padding: '16px 18px', border: 'none', resize: 'vertical',
                    fontFamily: 'SF Mono, Fira Code, Consolas, monospace', fontSize: 12, lineHeight: 1.65,
                    background: selected.status !== 'pending_review' ? '#fafafa' : '#fff',
                    color: 'var(--text)', outline: 'none',
                  }}
                />

                {/* Actions */}
                {selected.status === 'pending_review' && (
                  <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => doAction('reject')} disabled={saving} className="btn-ghost" style={{ color: '#b91c1c', borderColor: '#fecaca', fontSize: 12 }}>
                      Reject
                    </button>
                    <button onClick={() => doAction('edit')} disabled={saving} className="btn-ghost" style={{ fontSize: 12 }}>
                      Save Edits
                    </button>
                    <button onClick={() => doAction('approve')} disabled={saving} className="btn-primary" style={{ fontSize: 12 }}>
                      {saving ? 'Sending…' : 'Approve & Send'}
                    </button>
                  </div>
                )}

                {selected.status !== 'pending_review' && (
                  <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', background: '#fafafa', fontSize: 11, color: 'var(--text-faint)' }}>
                    Draft {selected.status}{selected.reviewedAt ? ` · ${new Date(selected.reviewedAt).toLocaleString('en-GB')}` : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
