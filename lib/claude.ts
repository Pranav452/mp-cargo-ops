import Anthropic from '@anthropic-ai/sdk'
import type { ArrivalNotice, Container, EmailDraft, Carrier, ContainerStatus, ReleaseStatus } from '@/types'
import type { RawThread } from './gmail'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com',
})

// ─── Retry wrapper ────────────────────────────────────────────────────────────

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 4
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err?.status ?? err?.error?.status
      const isRetryable = status === 529 || status === 529 || err?.message?.includes('overloaded')
      if (!isRetryable || attempt === maxRetries) throw err
      const delay = Math.min(2000 * 2 ** attempt, 30000) // 2s, 4s, 8s, 16s, max 30s
      console.log(`[Claude] Overloaded — retry ${attempt + 1}/${maxRetries} in ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('Max retries exceeded')
}

// ─── Arrival Notice Detection ─────────────────────────────────────────────────

export async function detectArrivalNotices(
  threads: RawThread[]
): Promise<ArrivalNotice[]> {
  if (threads.length === 0) return []

  const prompt = `You are an expert freight forwarding operations assistant for MP Cargo France.

Analyze the following email threads and identify any CMA-CGM arrival notices (Avis d'Arrivée / Notice of Arrival / NOA).

For each arrival notice found, extract ALL of the following fields from the email body (NOT from PDF attachments):
- container: container number (4-letter prefix + 7 digits, e.g. CMAU1234567)
- mbl: B/L number (e.g. AID0330814 or AMC2533996)
- vessel: vessel name
- voyage: voyage number
- etaAntwerp: ETA at Antwerp (format: DD-MMM-YYYY)
- pol: port of loading
- pod: port of discharge
- shipper: shipper name
- consignee: consignee/client name
- notify: notify party
- sealNumber: seal number
- size: container size (e.g. 40H, 20F)
- hsCode: HS code
- cargoDescription: cargo description
- pieces: number of pieces/packages
- weight: gross weight in kg
- volume: volume in m³
- mrn: MRN number if present
- customsId: vessel customs ID if present
- keyReference: key reference if present
- sourceThreadId: the thread ID provided below
- sourceMessageId: the message ID of the message containing the notice
- detectedAt: current ISO datetime

Threads to analyze:
${threads
  .map(
    (t, i) => `
=== THREAD ${i + 1} ===
Thread ID: ${t.id}
Subject: ${t.subject}
From: ${t.from}
Date: ${t.date}

Messages:
${t.messages
  .map(
    (m, j) => `
  --- Message ${j + 1} ---
  Message ID: ${m.id}
  From: ${m.from}
  Date: ${m.date}
  Body:
  ${m.body.slice(0, 1200)}
`
  )
  .join('')}
`
  )
  .join('\n')}

Return a JSON array of arrival notices. If no arrival notices are found, return [].
Only extract data that is explicitly present in the email text. Use empty string "" for missing fields.
Return ONLY valid JSON, no explanation.`

  const response = await callWithRetry(() => client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  }))

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0]) as ArrivalNotice[]
  } catch {
    console.error('Failed to parse arrival notices from Claude response')
    return []
  }
}

// ─── Release Thread Analysis ──────────────────────────────────────────────────

export interface ReleaseAnalysis {
  container: string
  mbl: string
  carrier: Carrier
  vessel: string
  eta: string           // ISO date
  status: ContainerStatus
  release: ReleaseStatus
  lastAction: string
  note: string
  threadId: string
  noaToGilles: boolean
}

export async function analyzeReleaseThreads(
  releaseThreads: RawThread[],
  instructionDouaneThreads: RawThread[]
): Promise<ReleaseAnalysis[]> {
  if (releaseThreads.length === 0) return []

  const today = new Date().toISOString().split('T')[0]

  // Build set of containers that have had Instruction Douane sent
  const noaSentContainers = new Set<string>()
  for (const t of instructionDouaneThreads) {
    const match = t.subject.match(/[A-Z]{4}\d{7}/)
    if (match) noaSentContainers.add(match[0])
  }

  const prompt = `You are an expert freight forwarding operations assistant for MP Cargo France.
Today's date: ${today}

Analyze these Gmail release request threads and for each container determine its current status.

CARRIER DETECTION RULES:
- MBL starts with AMC or AID → CMA
- MBL starts with MEDU or MAGU → MSC
- Container prefix HAMU or HLCU → HAPAG
- Container prefix EGSU, EMCU, EISU, TXGU → EVGR (Evergreen)
- Container prefix KOCU → HMM
- Default → CMA

STATUS RULES:
- "critical": ETA is within 3 days from today AND no CMA reply, OR ETA passed and no confirmation
- "check": ETA passed and status unconfirmed (no explicit release confirmation)
- "upcoming": ETA is more than 7 days from today, release request sent
- "resolved": CMA/carrier explicitly confirmed release OR container delivered

RELEASE STATUS:
- "confirmed": carrier explicitly said "release done", "released", "BAD validé", "release is well in cpu"
- "requested": release request sent, no reply yet
- "payment_sent": proof of payment sent, awaiting release
- "noa_sent_by_cma": CMA said "NOA has been sent" but release not confirmed
- "no_reply": follow-up(s) sent, zero carrier response
- "unknown": unclear from available data

These containers already have Instruction Douane (NOA) sent to Gilles:
${Array.from(noaSentContainers).join(', ') || 'none'}

Threads to analyze (newest messages last in each thread):
${releaseThreads
  .slice(0, 15)
  .map(
    (t, i) => `
=== THREAD ${i + 1} ===
Thread ID: ${t.id}
Subject: ${t.subject}

Messages (summary):
${t.messages
  .slice(-3)
  .map((m) => `  [${m.date}] FROM: ${m.from}\n  ${m.snippet}`)
  .join('\n')}
`
  )
  .join('\n')}

Return a JSON array. Each object must have:
{
  "container": string,
  "mbl": string,
  "carrier": "CMA"|"MSC"|"HAPAG"|"EVGR"|"HMM"|"OTHER",
  "vessel": string,
  "eta": "YYYY-MM-DD",
  "status": "critical"|"check"|"upcoming"|"resolved",
  "release": "confirmed"|"requested"|"payment_sent"|"noa_sent_by_cma"|"no_reply"|"unknown",
  "lastAction": string (max 100 chars, plain English),
  "note": string (max 120 chars),
  "threadId": string,
  "noaToGilles": boolean
}

Return ONLY valid JSON array, no explanation.`

  const response = await callWithRetry(() => client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  }))

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const results = JSON.parse(jsonMatch[0]) as ReleaseAnalysis[]
    // Mark noaToGilles based on our set
    return results.map((r) => ({
      ...r,
      noaToGilles: r.noaToGilles || noaSentContainers.has(r.container),
    }))
  } catch {
    console.error('Failed to parse release analysis from Claude response')
    return []
  }
}

// ─── Draft: Instruction Douane (NOA forward to Gilles) ───────────────────────

export async function draftInstructionDouane(
  notice: ArrivalNotice
): Promise<{ subject: string; body: string }> {
  const prompt = `You are Devanshi, operations lead at MP Cargo France.

Draft an "INSTRUCTION DOUANE" email to forward this arrival notice to Gilles Vandevelde at AMR Agency.

Use EXACTLY this format:

Subject: INSTRUCTION DOUANE [CLIENT/CONSIGNEE NAME] / [CONTAINER NUMBER] [SIZE]

Body:
Bonjour Gilles,

Ci-joint l'avis d'arrivée pour ce container.

════════════════════════════════════════
ARRIVAL NOTICE – CMA CGM
════════════════════════════════════════
Date                : [DD-MMM-YYYY]
Vessel / Voyage     : [VESSEL NAME] / [VOYAGE NUMBER]
ETA Antwerp         : [DD-MMM-YYYY]
POD                 : [PORT OF DISCHARGE]
POL                 : [PORT OF LOADING]

B/L Number          : [BL NUMBER]
Vessel Customs ID   : [CUSTOMS ID]
MRN                 : [MRN NUMBER]

Shipper             : [SHIPPER NAME]
Consignee           : [CONSIGNEE NAME]
Notify              : [NOTIFY PARTY]

────────────────────────────────────────
CONTAINER DETAILS
────────────────────────────────────────
Container           : [CONTAINER NUMBER]
Seal                : [SEAL NUMBER]
Size                : [SIZE]
Key Reference       : [KEY REFERENCE]

────────────────────────────────────────
CARGO
────────────────────────────────────────
HS Code   Description                    PCS/QTY     Weight (kg)   Volume (m³)
[CODE]    [DESCRIPTION]                  [QTY]       [WEIGHT]      [VOLUME]
════════════════════════════════════════
CMA CGM Belgium NV – bel.service@cma-cgm.com

Cordialement,

Devanshi
MP CARGO
devanshi@manilal.com

Arrival notice data:
${JSON.stringify(notice, null, 2)}

Return JSON: { "subject": "...", "body": "..." }
Return ONLY valid JSON, no explanation.`

  const response = await callWithRetry(() => client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  }))

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Failed to generate draft')
  return JSON.parse(jsonMatch[0])
}

// ─── Draft: Release Reminder ──────────────────────────────────────────────────

export async function draftReleaseReminder(
  container: Container
): Promise<{ subject: string; body: string }> {
  const eta = new Date(container.eta)
  const etaFormatted = eta.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const body = `Bonjour / Dear CMA Team,

Nous revenons vers vous concernant la demande de relâche ci-dessous.
We are following up on the below release request.

────────────────────────────────────────
DETAILS DU CONTAINER / SHIPMENT DETAILS
────────────────────────────────────────
  MBL               :  ${container.mbl}
  Container         :  ${container.container}  /  ${container.vessel || '—'}
  ETA Antwerp       :  ${etaFormatted}  –  ${container.vessel}
────────────────────────────────────────

Merci de bien vouloir nous confirmer les points suivants :
Please kindly confirm the following :

  1.  Relâche du container sur CPU / Release of this container on CPU
  2.  Confirmation de l'ETA à Anvers / Confirmation of ETA at Antwerp
  3.  Envoi de l'avis d'arrivée (NOA) dès que disponible / Sending of the NOA as soon as available

Ces informations sont nécessaires pour préparer le dédouanement dans les délais.
This information is required to prepare customs clearance on time.

Regards / Cordialement,
MP Ops Team
mpcargolille@gmail.com`

  const subject = `RE: RELEASE REQUEST FOR // CMA CGM // MBL : ${container.mbl} / CONTAINER : ${container.container}`

  return { subject, body }
}

// ─── Task Summary (for notifications) ────────────────────────────────────────

export async function generateDailySummary(
  containers: Container[],
  newNotices: ArrivalNotice[],
  draftsCreated: number
): Promise<string> {
  const critical = containers.filter((c) => c.status === 'critical')
  const check = containers.filter((c) => c.status === 'check')
  const upcoming = containers.filter((c) => c.status === 'upcoming')

  const prompt = `You are an MP Cargo France operations assistant. Write a concise daily briefing email body (plain text, no markdown).

Data:
- New arrival notices found today: ${newNotices.length}
- Drafts created for Gilles: ${draftsCreated}
- Critical containers (action today): ${critical.length}
${critical.map((c) => `  • ${c.container} (${c.mbl}) — ETA ${c.eta} — ${c.lastAction}`).join('\n')}
- Containers needing check: ${check.length}
${check.map((c) => `  • ${c.container} (${c.mbl}) — ETA ${c.eta} — ${c.lastAction}`).join('\n')}
- Upcoming (no action yet): ${upcoming.length}

Write a short, direct briefing in Devanshi's voice: direct, clear, no fluff. Use plain text only. Start with the most urgent items. Max 300 words.`

  const response = await callWithRetry(() => client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  }))

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
