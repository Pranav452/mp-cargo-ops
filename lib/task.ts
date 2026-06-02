/**
 * Core task logic — mirrors the Cowork SKILL.md
 * Called by /api/cron (scheduled) and /api/run (manual trigger)
 */

import { searchThreads, createGmailDraft } from './gmail'
import {
  detectArrivalNotices,
  analyzeReleaseThreads,
  draftInstructionDouane,
  draftReleaseReminder,
  generateDailySummary,
} from './claude'
import {
  getState,
  updateContainers,
  addDraft,
  saveTaskRun,
  generateId,
} from './store'
import { sendNotification } from './notify'
import { log, logStart, logEnd } from './runlog'
import type { Container, EmailDraft, TaskRun } from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

const GILLES_EMAIL = 'zeebrugge@amragency.com'
const INTERNAL_CC = 'airops2.lil@manilal.com'
const CMA_DOCS = 'fra.documentation.import@cma-cgm.com'
const CMA_SERVICE = 'bel.service@cma-cgm.com'

export async function runDailyTask(): Promise<TaskRun> {
  const runId = generateId()
  const startedAt = new Date().toISOString()
  const today = new Date()

  const run: TaskRun = {
    id: runId,
    startedAt,
    status: 'running',
    summary: {
      arrivalNoticesFound: 0,
      draftsCreated: 0,
      containersChecked: 0,
      criticalItems: 0,
      notificationSent: false,
    },
  }

  logStart()
  try {
    // ─── PART 1: Arrival Notices ────────────────────────────────────────────

    log('🔍 Connecting to Gmail…', 'step')

    const noaQueries = [
      'from:noreply@cma-cgm.com has:attachment newer_than:60d',
      'from:fra.documentation.import@cma-cgm.com has:attachment newer_than:60d',
      'from:ssc.beimport@cma-cgm.com has:attachment newer_than:60d',
      'from:bel.service@cma-cgm.com has:attachment newer_than:60d',
      '(subject:"avis d\'arrivée" OR subject:"NOA" OR subject:"arrival notice") newer_than:60d',
    ]

    log('📬 Searching Gmail for CMA arrival notices (5 queries)…', 'step')
    const noaThreadsRaw = await Promise.all(
      noaQueries.map((q) => searchThreads(q, 10))
    )

    // Deduplicate by thread ID
    const seen = new Set<string>()
    const noaThreads = noaThreadsRaw.flat().filter((t) => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })

    log(`📧 Found ${noaThreads.length} unique email threads to analyze`, 'info')
    log('🤖 Claude reading emails — detecting arrival notices…', 'step')
    const arrivalNotices = await detectArrivalNotices(noaThreads)
    run.summary.arrivalNoticesFound = arrivalNotices.length
    log(`✅ Found ${arrivalNotices.length} arrival notice(s)`, arrivalNotices.length > 0 ? 'ok' : 'info')

    // For each notice, check if Instruction Douane already sent, then draft
    const existingState = await getState()
    const existingNoaContainers = new Set(
      existingState.containers
        .filter((c) => c.noaToGilles)
        .map((c) => c.container)
    )

    for (const notice of arrivalNotices) {
      // Check for existing Instruction Douane thread
      const existingThread = await searchThreads(
        `subject:"INSTRUCTION DOUANE" "${notice.container}"`,
        3
      )

      if (existingThread.length > 0) {
        log(`⏭ ${notice.container} — Instruction Douane already sent, skipping`, 'info')
        continue
      }

      if (existingNoaContainers.has(notice.container)) {
        log(`⏭ ${notice.container} — already tracked, skipping`, 'info')
        continue
      }

      log(`✍️ Claude drafting Instruction Douane for ${notice.container} (${notice.consignee})…`, 'step')
      const { subject, body } = await draftInstructionDouane(notice)

      log(`💾 Saving draft to Gmail for ${notice.container}…`, 'step')
      const gmailDraftId = await createGmailDraft({
        to: [GILLES_EMAIL],
        cc: [INTERNAL_CC],
        subject,
        body,
      })

      // Save to our store
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
      run.summary.draftsCreated++
      log(`✅ Draft created: ${subject.slice(0, 60)}`, 'ok')
    }

    // ─── PART 2: Release Reminders ──────────────────────────────────────────

    log('🔍 Searching Gmail for release request threads…', 'step')

    // Fetch release request threads
    const releaseThreads = await searchThreads(
      'subject:"RELEASE REQUEST" after:2026/03/01',
      50
    )

    // Fetch Instruction Douane threads for cross-reference
    const instrDouaneThreads = await searchThreads(
      'subject:"INSTRUCTION DOUANE" newer_than:60d',
      30
    )

    log(`📋 Found ${releaseThreads.length} release threads + ${instrDouaneThreads.length} Instruction Douane threads`, 'info')
    log('🤖 Claude analyzing all release threads — determining container status…', 'step')
    const analyses = await analyzeReleaseThreads(releaseThreads, instrDouaneThreads)
    run.summary.containersChecked = analyses.length
    log(`✅ Analyzed ${analyses.length} container(s)`, 'ok')

    // Convert to Container objects and update store
    const containers: Container[] = analyses.map((a) => ({
      ...a,
      updatedAt: new Date().toISOString(),
    }))

    await updateContainers(containers)

    // Check which containers need a release reminder today (ETA = 7 days out)
    const needsReminder = containers.filter((c) => {
      if (c.status === 'resolved') return false
      if (c.carrier !== 'CMA') return false // Only CMA uses bilingual template
      try {
        const eta = parseISO(c.eta)
        const daysOut = differenceInDays(eta, today)
        return daysOut === 7
      } catch {
        return false
      }
    })

    // Also flag overdue (ETA within 7 days, no recent reminder)
    const overdue = containers.filter((c) => {
      if (c.status === 'resolved') return false
      if (c.carrier !== 'CMA') return false
      try {
        const eta = parseISO(c.eta)
        const daysOut = differenceInDays(eta, today)
        return daysOut > 0 && daysOut < 7 && c.release === 'no_reply'
      } catch {
        return false
      }
    })

    log(`⏰ ${needsReminder.length} container(s) need 7-day reminder, ${overdue.length} overdue`, 'info')
    for (const container of [...needsReminder, ...overdue]) {
      // Don't duplicate — check if we already drafted a reminder recently
      const existingDraft = existingState.drafts.find(
        (d) =>
          d.container === container.container &&
          d.type === 'release_reminder' &&
          d.status === 'pending_review'
      )
      if (existingDraft) continue

      log(`✍️ Drafting release reminder for ${container.container} (ETA ${container.eta})…`, 'step')
      const { subject, body } = await draftReleaseReminder(container)

      log(`💾 Saving release reminder to Gmail…`, 'step')
      const gmailDraftId = await createGmailDraft({
        to: [CMA_DOCS, CMA_SERVICE],
        subject,
        body,
        replyToThreadId: container.threadId,
      })

      const draft: EmailDraft = {
        id: generateId(),
        type: 'release_reminder',
        status: 'pending_review',
        container: container.container,
        mbl: container.mbl,
        to: [CMA_DOCS, CMA_SERVICE],
        cc: [],
        subject,
        body,
        gmailDraftId,
        createdAt: new Date().toISOString(),
      }

      await addDraft(draft)
      run.summary.draftsCreated++
      log(`✅ Release reminder draft created for ${container.container}`, 'ok')
    }

    // ─── PART 3: Notifications ──────────────────────────────────────────────

    log('📊 Compiling final summary…', 'step')
    const finalState = await getState()
    const criticalContainers = finalState.containers.filter(
      (c) => c.status === 'critical'
    )
    run.summary.criticalItems = criticalContainers.length

    if (criticalContainers.length > 0 || arrivalNotices.length > 0) {
      log('🤖 Claude generating daily briefing text…', 'step')
      const summaryText = await generateDailySummary(
        finalState.containers,
        arrivalNotices,
        run.summary.draftsCreated
      )

      await sendNotification({
        subject: `[MP Cargo] Daily Briefing — ${criticalContainers.length} critical item(s)`,
        body: summaryText,
      })

      run.summary.notificationSent = true
      log('📨 Email notification sent to Devanshi', 'ok')
    }

    run.status = 'completed'
    run.completedAt = new Date().toISOString()
    log(`🏁 Done — ${run.summary.arrivalNoticesFound} notices, ${run.summary.draftsCreated} drafts, ${run.summary.containersChecked} containers`, 'ok')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    run.status = 'failed'
    run.error = msg
    run.completedAt = new Date().toISOString()
    log(`❌ Task failed: ${msg}`, 'error')
  } finally {
    logEnd()
  }

  await saveTaskRun(run)
  return run
}
