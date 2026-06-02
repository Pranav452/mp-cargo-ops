import type { Container } from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

export function ActionItems({ containers }: { containers: Container[] }) {
  const today = new Date()

  const critical = containers.filter((c) => c.status === 'critical')
  const check = containers.filter((c) => c.status === 'check')
  const noNoa = containers.filter((c) => !c.noaToGilles && c.status !== 'upcoming' && c.status !== 'resolved')
  const msc = containers.filter((c) => c.carrier === 'MSC' && c.status !== 'resolved')

  const items: { level: 'critical' | 'warning' | 'info'; badge: string; title: string; desc: string; meta: string }[] = []

  for (const c of critical) {
    let daysLabel = ''
    try {
      const days = differenceInDays(parseISO(c.eta), today)
      daysLabel = days <= 0 ? 'ETA PASSED' : days === 1 ? 'ETA TOMORROW' : `ETA in ${days}d`
    } catch {}
    items.push({ level: 'critical', badge: 'URGENT', title: `${c.container} — ${daysLabel}`, desc: c.lastAction, meta: `MBL: ${c.mbl} · ${c.carrier}` })
  }

  for (const c of check) {
    items.push({ level: 'warning', badge: 'CHECK', title: `${c.container} — Verify release status`, desc: c.lastAction, meta: `MBL: ${c.mbl} · ETA ${c.eta}` })
  }

  if (noNoa.length > 0) {
    items.push({ level: 'warning', badge: 'NOA', title: `${noNoa.length} container(s) missing Instruction Douane to Gilles`, desc: noNoa.map((c) => c.container).join(', '), meta: 'Check Drafts tab' })
  }

  if (msc.length > 0) {
    items.push({ level: 'info', badge: 'MSC', title: `${msc.length} MSC container(s) — separate release process`, desc: msc.map((c) => `${c.container} (${c.mbl})`).join(', '), meta: 'Contact: bel-imp.customercare@msc.com' })
  }

  const BADGE: Record<string, { bg: string; color: string; border: string }> = {
    critical: { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
    warning:  { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
    info:     { bg: '#f0f9ff', color: '#075985', border: '#bae6fd' },
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-faint)', marginBottom: 10 }}>
        Action Items
      </div>
      {items.length === 0 ? (
        <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
          No critical action items today.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item, i) => {
            const s = BADGE[item.level]
            return (
              <div key={i} className="card" style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                  whiteSpace: 'nowrap', marginTop: 1, letterSpacing: 0.4,
                }}>
                  {item.badge}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>{item.meta}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
