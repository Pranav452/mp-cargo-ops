'use client'

import { useState } from 'react'

interface Props {
  onClose: () => void
}

const QUICK_TO = [
  { label: 'CMA Docs', value: 'fra.documentation.import@cma-cgm.com' },
  { label: 'CMA Service', value: 'bel.service@cma-cgm.com' },
  { label: 'Gilles (AMR)', value: 'zeebrugge@amragency.com' },
  { label: 'MSC Belgium', value: 'bel-imp.customercare@msc.com' },
  { label: 'Ops CC', value: 'airops2.lil@manilal.com' },
]

export function ComposeModal({ onClose }: Props) {
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [lastAction, setLastAction] = useState<'send' | 'draft'>('send')
  const [errorMsg, setErrorMsg] = useState('')

  const send = async (sendNow: boolean) => {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setErrorMsg('Fill in To, Subject, and Body.')
      return
    }
    setStatus('sending')
    setLastAction(sendNow ? 'send' : 'draft')
    setErrorMsg('')
    try {
      const res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), cc: cc.trim() || undefined, subject, body, sendNow }),
      })
      const data = await res.json().catch(() => ({ error: `Server error ${res.status}` }))
      if (data.success) {
        setStatus('done')
        setTimeout(onClose, 1200)
      } else {
        throw new Error(data.error ?? JSON.stringify(data))
      }
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      padding: '0 24px 24px 0',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: 580, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden', border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{
          background: '#111', color: '#fff',
          padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>New Email — mpcargolille@gmail.com</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Quick recipients */}
        <div style={{ padding: '10px 16px', background: '#fafafa', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {QUICK_TO.map((q) => (
            <button key={q.value} onClick={() => setTo(q.value)} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 20,
              background: to === q.value ? '#111' : '#fff',
              color: to === q.value ? '#fff' : 'var(--text-muted)',
              border: '1px solid', borderColor: to === q.value ? '#111' : 'var(--border)',
              cursor: 'pointer', fontWeight: 500,
            }}>
              {q.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ padding: '10px 14px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { label: 'To', value: to, set: setTo, placeholder: 'recipient@example.com' },
            { label: 'Cc', value: cc, set: setCc, placeholder: 'optional' },
            { label: 'Subject', value: subject, set: setSubject, placeholder: 'Email subject' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #e5e7eb', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, color: '#6b7280', minWidth: 44, fontWeight: 500 }}>{label}</span>
              <input
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={placeholder}
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#111827', background: 'transparent' }}
              />
            </div>
          ))}
        </div>

        {/* Body */}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email here…"
          style={{
            flex: 1, margin: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 6,
            padding: '10px 12px', fontSize: 13, lineHeight: 1.6, resize: 'vertical',
            fontFamily: 'inherit', outline: 'none', minHeight: 220, color: '#111827',
          }}
        />

        {/* Error */}
        {errorMsg && (
          <div style={{ margin: '0 14px', fontSize: 11, color: '#dc2626', padding: '4px 0' }}>{errorMsg}</div>
        )}

        {/* Actions */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {status === 'done' && (
          <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
            {lastAction === 'send' ? '✅ Sent!' : '💾 Saved to drafts!'}
          </span>
        )}
          <button onClick={() => send(false)} disabled={status === 'sending'} className="btn-ghost" style={{ fontSize: 12 }}>
            Save Draft
          </button>
          <button onClick={() => send(true)} disabled={status === 'sending'} className="btn-primary" style={{ fontSize: 12 }}>
            {status === 'sending' ? 'Sending…' : 'Send Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
