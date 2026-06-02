import type { TaskRun } from '@/types'

export function RunStatus({ run }: { run: TaskRun | null }) {
  if (!run) return null

  const isOk = run.status === 'completed'
  const completedAt = run.completedAt ? new Date(run.completedAt) : null

  return (
    <div className="card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
          background: isOk ? '#16a34a' : '#e53e3e',
        }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: isOk ? '#16a34a' : '#e53e3e' }}>
          {isOk ? 'Last run completed' : 'Last run failed'}
        </span>
        {completedAt && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            {completedAt.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      {isOk && (
        <div style={{ display: 'flex', gap: 16, marginLeft: 'auto' }}>
          <Stat label="NOAs found" value={run.summary.arrivalNoticesFound} />
          <Stat label="Drafts created" value={run.summary.draftsCreated} />
          <Stat label="Containers checked" value={run.summary.containersChecked} />
          <Stat label="Critical items" value={run.summary.criticalItems} urgent={run.summary.criticalItems > 0} />
        </div>
      )}
      {run.error && (
        <span style={{ fontSize: 11, color: '#e53e3e', fontFamily: 'monospace', marginLeft: 'auto' }}>{run.error}</span>
      )}
    </div>
  )
}

function Stat({ label, value, urgent }: { label: string; value: number; urgent?: boolean }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: urgent && value > 0 ? '#e53e3e' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{label}</div>
    </div>
  )
}
