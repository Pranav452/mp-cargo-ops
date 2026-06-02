'use client'

import { useState } from 'react'
import type { Container, ContainerStatus, ReleaseStatus, Carrier } from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

const STATUS_PILL: Record<ContainerStatus, { label: string; bg: string; color: string; border: string }> = {
  critical: { label: 'Critical',     bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  check:    { label: 'Needs Check',  bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  upcoming: { label: 'Upcoming',     bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  resolved: { label: 'Resolved',     bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
}

const RELEASE_PILL: Record<ReleaseStatus, { label: string; bg: string; color: string; border: string }> = {
  confirmed:      { label: 'Released',    bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  requested:      { label: 'Requested',   bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  payment_sent:   { label: 'PoP Sent',    bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  noa_sent_by_cma:{ label: 'NOA by CMA', bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  no_reply:       { label: 'No Reply',    bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  unknown:        { label: 'Unknown',     bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' },
}

const CARRIER_DOT: Record<Carrier, string> = {
  CMA: '#2563eb', MSC: '#db2777', HAPAG: '#d97706', EVGR: '#16a34a', HMM: '#7c3aed', OTHER: '#9ca3af',
}

function Pill({ bg, color, border, label }: { bg: string; color: string; border: string; label: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function ETACell({ etaStr }: { etaStr: string }) {
  try {
    const eta = parseISO(etaStr)
    const days = differenceInDays(eta, new Date())
    const formatted = eta.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    if (days < 0) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{formatted}</span>
    if (days === 0) return <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>{formatted} · TODAY</span>
    if (days === 1) return <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>{formatted} · TOMORROW</span>
    if (days <= 7) return <span style={{ color: '#d97706', fontWeight: 600, fontSize: 11 }}>{formatted} <span style={{ color: 'var(--text-faint)' }}>({days}d)</span></span>
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatted} <span style={{ color: 'var(--text-faint)' }}>({days}d)</span></span>
  } catch {
    return <span style={{ fontSize: 11 }}>{etaStr}</span>
  }
}

type FilterKey = 'all' | ContainerStatus | Carrier

export function ContainerTable({ containers, compact = false }: { containers: Container[]; compact?: boolean }) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [sortKey, setSortKey] = useState<'eta' | 'status' | 'carrier'>('eta')

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'critical', label: 'Critical' },
    { key: 'check', label: 'Needs Check' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'MSC', label: 'MSC' },
    { key: 'HAPAG', label: 'Hapag' },
    { key: 'EVGR', label: 'Evergreen' },
  ]

  const filtered = containers.filter((c) =>
    activeFilter === 'all' ? true : c.status === activeFilter || c.carrier === activeFilter
  )

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'eta') return a.eta.localeCompare(b.eta)
    if (sortKey === 'status') {
      const order = { critical: 0, check: 1, upcoming: 2, resolved: 3 }
      return (order[a.status] ?? 9) - (order[b.status] ?? 9)
    }
    return a.carrier.localeCompare(b.carrier)
  })

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {!compact && (
        <>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Containers <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 12 }}>({filtered.length})</span></span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
              style={{ fontSize: 11, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--text)', outline: 'none' }}
            >
              <option value="eta">Sort: ETA</option>
              <option value="status">Sort: Status</option>
              <option value="carrier">Sort: Carrier</option>
            </select>
          </div>
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {filters.map((f) => (
              <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                border: '1px solid',
                borderColor: activeFilter === f.key ? '#111' : 'var(--border)',
                background: activeFilter === f.key ? '#111' : '#fff',
                color: activeFilter === f.key ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.1s',
              }}>
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              {['Container', 'MBL', 'Carrier', 'Vessel', 'ETA Antwerp', 'Status', 'Release', 'NOA → Gilles', 'Last Action'].map((h) => (
                <th key={h} style={{
                  padding: '9px 14px', textAlign: 'left',
                  fontSize: 10, fontWeight: 600, color: 'var(--text-faint)',
                  textTransform: 'uppercase', letterSpacing: 0.6,
                  borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-faint)', fontSize: 13 }}>
                  No containers match this filter.
                </td>
              </tr>
            ) : sorted.map((c, idx) => {
              const statusStyle = STATUS_PILL[c.status]
              const releaseStyle = RELEASE_PILL[c.release]
              const carrierColor = CARRIER_DOT[c.carrier] ?? '#9ca3af'

              return (
                <tr key={c.container} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, letterSpacing: 0.3 }}>{c.container}</span>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)' }}>{c.mbl}</span>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: carrierColor, display: 'inline-block', flexShrink: 0 }} />
                      {c.carrier}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-muted)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.vessel || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                    <ETACell etaStr={c.eta} />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
                    <Pill {...statusStyle} />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
                    <Pill {...releaseStyle} />
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)' }}>
                    {c.noaToGilles
                      ? <Pill bg="#f0fdf4" color="#15803d" border="#bbf7d0" label="Sent" />
                      : <Pill bg="#f9fafb" color="#6b7280" border="#e5e7eb" label="Pending" />}
                  </td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-light)', fontSize: 11, color: 'var(--text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.lastAction}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
