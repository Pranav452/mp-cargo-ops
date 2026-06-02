import type { Container } from '@/types'

const ICONS = {
  critical: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  upcoming: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  resolved: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
}

export function StatusKPIs({ containers }: { containers: Container[] }) {
  const critical = containers.filter((c) => c.status === 'critical').length
  const check = containers.filter((c) => c.status === 'check').length
  const upcoming = containers.filter((c) => c.status === 'upcoming').length
  const resolved = containers.filter((c) => c.status === 'resolved').length

  const cards = [
    { key: 'critical', label: 'Critical', value: critical, sub: 'Action required today', iconColor: '#e53e3e' },
    { key: 'check', label: 'Needs Check', value: check, sub: 'ETA passed, unconfirmed', iconColor: '#d97706' },
    { key: 'upcoming', label: 'Upcoming', value: upcoming, sub: 'ETA within 30 days', iconColor: '#2563eb' },
    { key: 'resolved', label: 'Resolved', value: resolved, sub: 'Released / delivered', iconColor: '#16a34a' },
  ] as const

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
      {cards.map((c) => (
        <div key={c.key} className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: 0.2 }}>{c.label}</span>
            <span style={{ color: c.iconColor, opacity: 0.7 }}>{ICONS[c.key]}</span>
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, color: 'var(--text)', marginBottom: 6 }}>{c.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
