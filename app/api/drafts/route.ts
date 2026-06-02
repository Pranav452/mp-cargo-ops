import { NextRequest, NextResponse } from 'next/server'
import { getState, updateDraft } from '@/lib/store'
import { sendDraft, deleteDraft, createGmailDraft } from '@/lib/gmail'

// GET /api/drafts — list all drafts
export async function GET() {
  const state = await getState()
  return NextResponse.json({ drafts: state.drafts })
}

// PATCH /api/drafts — approve, reject, or edit a draft
export async function PATCH(req: NextRequest) {
  const { draftId, action, body, subject } = await req.json()

  if (!draftId || !action) {
    return NextResponse.json({ error: 'Missing draftId or action' }, { status: 400 })
  }

  const state = await getState()
  const draft = state.drafts.find((d) => d.id === draftId)

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (action === 'approve') {
    if (!draft.gmailDraftId) {
      return NextResponse.json({ error: 'No Gmail draft ID' }, { status: 400 })
    }
    // If body was edited, delete old draft and create new one before sending
    if (body && body !== draft.body) {
      await deleteDraft(draft.gmailDraftId)
      const newGmailDraftId = await createGmailDraft({
        to: draft.to,
        cc: draft.cc,
        subject: subject ?? draft.subject,
        body,
      })
      await sendDraft(newGmailDraftId)
    } else {
      await sendDraft(draft.gmailDraftId)
    }
    await updateDraft(draftId, {
      status: 'sent',
      reviewedAt: new Date().toISOString(),
      body: body ?? draft.body,
    })
    return NextResponse.json({ success: true, action: 'sent' })
  }

  if (action === 'reject') {
    if (draft.gmailDraftId) {
      await deleteDraft(draft.gmailDraftId).catch(() => {}) // best-effort
    }
    await updateDraft(draftId, {
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
    })
    return NextResponse.json({ success: true, action: 'rejected' })
  }

  if (action === 'edit') {
    // Just update the stored draft body — don't send yet
    await updateDraft(draftId, {
      body: body ?? draft.body,
      subject: subject ?? draft.subject,
    })
    // Update Gmail draft too
    if (draft.gmailDraftId) {
      await deleteDraft(draft.gmailDraftId).catch(() => {})
      const newGmailDraftId = await createGmailDraft({
        to: draft.to,
        cc: draft.cc,
        subject: subject ?? draft.subject,
        body: body ?? draft.body,
      })
      await updateDraft(draftId, { gmailDraftId: newGmailDraftId })
    }
    return NextResponse.json({ success: true, action: 'edited' })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
