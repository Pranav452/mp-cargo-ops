import { NextRequest, NextResponse } from 'next/server'
import { createGmailDraft, sendDraft } from '@/lib/gmail'

export async function POST(req: NextRequest) {
  try {
    const { to, cc, subject, body, sendNow } = await req.json()

    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'Missing to/subject/body' }, { status: 400 })
    }

    const toList = Array.isArray(to) ? to : [to]
    const ccList = cc ? (Array.isArray(cc) ? cc : [cc]) : []

    const gmailDraftId = await createGmailDraft({ to: toList, cc: ccList, subject, body })

    if (sendNow) {
      await sendDraft(gmailDraftId)
      return NextResponse.json({ success: true, sent: true })
    }

    return NextResponse.json({ success: true, sent: false, gmailDraftId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[Compose] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
