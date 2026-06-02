import { NextRequest, NextResponse } from 'next/server'
import { searchThreads, createGmailDraft } from '@/lib/gmail'
import { detectArrivalNotices, draftInstructionDouane } from '@/lib/claude'
import { getState, addDraft, generateId } from '@/lib/store'
import type { EmailDraft } from '@/types'

const GILLES_EMAIL = 'zeebrugge@amragency.com'
const INTERNAL_CC = 'airops2.lil@manilal.com'

export async function POST(req: NextRequest) {
  try {
    const { container, mbl } = await req.json()
    if (!container) return NextResponse.json({ error: 'Missing container' }, { status: 400 })

    // Search Gmail for this container's arrival notice
    const queries = [
      `"${container}" (subject:"avis d'arrivée" OR subject:"NOA" OR subject:"arrival notice")`,
      `"${container}" from:noreply@cma-cgm.com`,
      `"${container}" from:fra.documentation.import@cma-cgm.com`,
      `"${container}" from:bel.service@cma-cgm.com`,
      mbl ? `"${mbl}"` : null,
    ].filter(Boolean) as string[]

    const results = await Promise.all(queries.map((q) => searchThreads(q, 5)))
    const seen = new Set<string>()
    const threads = results.flat().filter((t) => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })

    if (threads.length === 0) {
      return NextResponse.json({ error: `No Gmail threads found for ${container}. The arrival notice email may not be in this mailbox.` }, { status: 404 })
    }

    // Ask Claude to extract arrival notice data
    const notices = await detectArrivalNotices(threads)
    const notice = notices.find((n) => n.container === container) ?? notices[0]

    if (!notice) {
      return NextResponse.json({ error: `Claude could not detect arrival notice data for ${container} in ${threads.length} thread(s) found.` }, { status: 422 })
    }

    // Check if draft already exists
    const state = await getState()
    const existing = state.drafts.find(
      (d) => d.container === container && d.type === 'instruction_douane' && d.status === 'pending_review'
    )
    if (existing) {
      return NextResponse.json({ error: `Draft already exists for ${container} — check Drafts tab.` }, { status: 409 })
    }

    // Draft the email
    const { subject, body } = await draftInstructionDouane(notice)

    const gmailDraftId = await createGmailDraft({
      to: [GILLES_EMAIL],
      cc: [INTERNAL_CC],
      subject,
      body,
    })

    const draft: EmailDraft = {
      id: generateId(),
      type: 'instruction_douane',
      status: 'pending_review',
      container: notice.container,
      mbl: notice.mbl,
      to: [GILLES_EMAIL],
      cc: [INTERNAL_CC],
      subject,
      body,
      gmailDraftId,
      createdAt: new Date().toISOString(),
    }

    await addDraft(draft)
    return NextResponse.json({ success: true, draftId: draft.id, subject })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[DraftNOA]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
