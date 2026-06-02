/**
 * Core task logic — incremental, batched, token-efficient
 *
 * Key optimizations:
 * 1. seenThreads (KV) — skip threads Claude already processed + no new messages
 * 2. listThreadsMeta first — get historyId without fetching bodies
 * 3. Regex pre-filter — only threads with container pattern go to Claude
 * 4. Batched Claude calls — 5 threads per call, 1.5s between batches
 * 5. Parallel — NOA search + Release search run simultaneously
 * 6. Wide windows (30d NOA, 90d Release) but only pay tokens for changed threads
 */

import { listThreadsMeta, searchThreads, fetchThread, createGmailDraft, type RawThread } from './gmail'
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
  getSeenThreads,
  updateSeenThreads,
} from './store'
import { sendNotification } from './notify'
import { log, logStart, logEnd } from './runlog'
import type { Container, EmailDraft, TaskRun } from '@/types'
import { differenceInDays, parseISO } from 'date-fns'

const GILLES_EMAIL = 'zeebrugge@amragency.com'
const INTERNAL_CC = 'airops2.lil@manilal.com'
const CMA_DOCS = 'fra.documentation.import@cma-cgm.com'
const CMA_SERVICE = 'bel.service@cma-cgm.com'

// Container number pattern: 4 uppercase letters + 7 digits
const CONTAINER_PATTERN = /[A-Z]{4}\d{7}/

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Batch helper ─────────────────────────────────────────────────────────────

async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  fn: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    if (i > 0) await sleep(delayMs)
    const batch = items.slice(i, i + batchSize)
    const res = await fn(batch)
    results.push(...res)
  }
  return results
}

// ─── Get only NEW or CHANGED threads ─────────────────────────────────────────

async function getChangedThreads(
  query: string,
  maxResults: number,
  seenThreads: Record<string, string>,
  requireContainerPattern = false
): Promise<{ threads: RawThread[]; newSeen: Record<string, string> }> {
  const meta = await listThreadsMeta(query, maxResults)

  // Determine which threads are new or have changed (historyId changed = new message)
  const changed = meta.filter((t) => {
    if (seenThreads[t.id] === t.historyId) return false // unchanged
    if (requireContainerPattern && !CONTAINER_PATTERN.test(t.snippet)) return false // no container in preview
    return true
  })

  const newSeen: Record<string, string> = {}
  meta.forEach((t) => { newSeen[t.id] = t.historyId })

  if (changed.length === 0) return { threads: [], newSeen }

  // Fetch full bodies only for changed threads
  const fetched = await Promise.all(changed.map((t) => fetchThread(t.id)))
  const threads = fetched.filter(Boolean) as RawThread[]

  return { threads, newSeen }
}

// ─── Main task ────────────────────────────────────────────────────────────────

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
    const seenThreads = await getSeenThreads()
    log(`📂 Loaded ${Object.keys(seenThreads).length} previously seen threads`, 'info')

    // ── PART 1 + 2 search in parallel ──────────────────────────────────────
    log('🔍 Scanning Gmail — NOA emails + release threads in parallel…', 'step')

    const [noaResult, releaseResult, instrDouaneResult] = await Promise.all([
      // NOA: 30d window, require container pattern in snippet
      getChangedThreads(
        'from:noreply@cma-cgm.com OR from:fra.documentation.import@cma-cgm.com OR from:ssc.beimport@cma-cgm.com OR from:bel.service@cma-cgm.com newer_than:30d',
        50,
        seenThreads,
        true // must have container pattern in snippet
      ),
      // Release: 90d window
      getChangedThreads(
        'subject:"RELEASE REQUEST" after:2026/01/01',
        80,
        seenThreads,
        false
      ),
      // Instruction Douane: lightweight metadata only
      listThreadsMeta('subject:"INSTRUCTION DOUANE" newer_than:90d', 50),
    ])

    log(`📧 NOA: ${noaResult.threads.length} new/changed threads (skipped ${Object.keys(noaResult.newSeen).length - noaResult.threads.length} unchanged)`, 'info')
    log(`📋 Release: ${releaseResult.threads.length} new/changed threads`, 'info')

    // ── PART 1: NOA Detection ───────────────────────────────────────────────

    let arrivalNotices: Awaited<ReturnType<typeof detectArrivalNotices>> = []

    if (noaResult.threads.length > 0) {
      log('🤖 Claude detecting arrival notices (batches of 5)…', 'step')

      // Process NOA threads in batches of 5 to stay under TPM
      arrivalNotices = (await batchProcess(
        noaResult.threads,
        5,
        1500,
        (batch) => detectArrivalNotices(batch)
      )).flat()

      // Deduplicate by container
      const seen = new Map<string, typeof arrivalNotices[0]>()
      arrivalNotices.forEach((n) => seen.set(n.container, n))
      arrivalNotices = Array.from(seen.values())

      run.summary.arrivalNoticesFound = arrivalNotices.length
      log(`✅ Found ${arrivalNotices.length} arrival notice(s)`, arrivalNotices.length > 0 ? 'ok' : 'info')
    } else {
      log('⏭ No new NOA emails since last run — skipping Claude call', 'info')
    }

    // Draft Instruction Douane for each new notice
    const existingState = await getState()
    const existingNoaContainers = new Set(
      existingState.containers.filter((c) => c.noaToGilles).map((c) => c.container)
    )

    for (const notice of arrivalNotices) {
      if (existingNoaContainers.has(notice.container)) {
        log(`⏭ ${notice.container} — already tracked, skipping`, 'info')
        continue
      }
      const existingDraftCheck = existingState.drafts.find(
        (d) => d.container === notice.container && d.type === 'instruction_douane'
      )
      if (existingDraftCheck) {
        log(`⏭ ${notice.container} — draft already exists, skipping`, 'info')
        continue
      }

      log(`✍️ Drafting Instruction Douane for ${notice.container} (${notice.consignee})…`, 'step')
      await sleep(1000) // rate limit buffer
      const { subject, body } = await draftInstructionDouane(notice)

      log(`💾 Saving to Gmail drafts…`, 'step')
      const gmailDraftId = await createGmailDraft({ to: [GILLES_EMAIL], cc: [INTERNAL_CC], subject, body })

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

    // ── PART 2: Release Analysis ────────────────────────────────────────────

    const instrDouaneSet = new Set(
      instrDouaneResult
        .map((t) => t.snippet.match(CONTAINER_PATTERN)?.[0])
        .filter(Boolean) as string[]
    )

    if (releaseResult.threads.length > 0) {
      log(`🤖 Claude analyzing ${releaseResult.threads.length} changed release threads…`, 'step')
      await sleep(2000) // let rate limit window reset a bit

      // Process in batches of 10 (release analysis uses haiku = much cheaper)
      const allAnalyses = (await batchProcess(
        releaseResult.threads,
        10,
        1500,
        (batch) => analyzeReleaseThreads(batch, [])
      )).flat()

      run.summary.containersChecked = allAnalyses.length

      // Mark noaToGilles from Instruction Douane threads
      const containers: Container[] = allAnalyses.map((a) => ({
        ...a,
        noaToGilles: a.noaToGilles || instrDouaneSet.has(a.container),
        updatedAt: new Date().toISOString(),
      }))

      await updateContainers(containers)
      log(`✅ Updated ${containers.length} container(s) in KV`, 'ok')

      // Release reminders for ETA-7d and overdue
      const allContainers = (await getState()).containers
      const needsReminder = allContainers.filter((c) => {
        if (c.status === 'resolved' || c.carrier !== 'CMA') return false
        try {
          const days = differenceInDays(parseISO(c.eta), today)
          return days === 7
        } catch { return false }
      })
      const overdue = allContainers.filter((c) => {
        if (c.status === 'resolved' || c.carrier !== 'CMA') return false
        try {
          const days = differenceInDays(parseISO(c.eta), today)
          return days > 0 && days < 7 && c.release === 'no_reply'
        } catch { return false }
      })

      log(`⏰ ${needsReminder.length} needing 7-day reminder, ${overdue.length} overdue`, 'info')

      for (const container of [...needsReminder, ...overdue]) {
        const alreadyDrafted = existingState.drafts.find(
          (d) => d.container === container.container && d.type === 'release_reminder' && d.status === 'pending_review'
        )
        if (alreadyDrafted) continue

        log(`✍️ Drafting release reminder for ${container.container}…`, 'step')
        const { subject, body } = await draftReleaseReminder(container)
        const gmailDraftId = await createGmailDraft({
          to: [CMA_DOCS, CMA_SERVICE],
          subject,
          body,
          replyToThreadId: container.threadId,
        })

        await addDraft({
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
        })
        run.summary.draftsCreated++
        log(`✅ Release reminder created for ${container.container}`, 'ok')
      }
    } else {
      log('⏭ No changed release threads — skipping analysis, keeping existing container data', 'info')
      run.summary.containersChecked = existingState.containers.length
    }

    // ── Save seen threads ────────────────────────────────────────────────────
    await updateSeenThreads({ ...noaResult.newSeen, ...releaseResult.newSeen })
    log(`💾 Updated seen thread cache (${Object.keys(noaResult.newSeen).length + Object.keys(releaseResult.newSeen).length} threads)`, 'info')

    // ── PART 3: Notifications ────────────────────────────────────────────────
    const finalState = await getState()
    const criticalContainers = finalState.containers.filter((c) => c.status === 'critical')
    run.summary.criticalItems = criticalContainers.length

    if (criticalContainers.length > 0 || arrivalNotices.length > 0) {
      log('🤖 Claude generating daily briefing…', 'step')
      const summaryText = await generateDailySummary(finalState.containers, arrivalNotices, run.summary.draftsCreated)
      await sendNotification({
        subject: `[MP Cargo] Daily Briefing — ${criticalContainers.length} critical item(s)`,
        body: summaryText,
      })
      run.summary.notificationSent = true
      log('📨 Notification sent', 'ok')
    }

    run.status = 'completed'
    run.completedAt = new Date().toISOString()
    log(`🏁 Done — ${run.summary.arrivalNoticesFound} NOAs, ${run.summary.draftsCreated} drafts, ${run.summary.containersChecked} containers`, 'ok')

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    run.status = 'failed'
    run.error = msg
    run.completedAt = new Date().toISOString()
    log(`❌ Failed: ${msg}`, 'error')
  } finally {
    logEnd()
  }

  await saveTaskRun(run)
  return run
}
