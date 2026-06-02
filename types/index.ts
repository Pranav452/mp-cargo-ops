// ─── Container ───────────────────────────────────────────────────────────────

export type ContainerStatus = 'critical' | 'check' | 'upcoming' | 'resolved'
export type ReleaseStatus =
  | 'confirmed'
  | 'requested'
  | 'payment_sent'
  | 'noa_sent_by_cma'
  | 'no_reply'
  | 'unknown'
export type Carrier = 'CMA' | 'MSC' | 'HAPAG' | 'EVGR' | 'HMM' | 'OTHER'

export interface Container {
  container: string       // e.g. TLLU8889457
  mbl: string             // e.g. AID0328888
  carrier: Carrier
  vessel: string
  eta: string             // ISO date: 2026-06-02
  status: ContainerStatus
  release: ReleaseStatus
  noaToGilles: boolean
  lastAction: string
  note: string
  threadId?: string       // Gmail thread ID for the release request
  updatedAt: string       // ISO datetime of last update
}

// ─── Arrival Notice ──────────────────────────────────────────────────────────

export interface ArrivalNotice {
  container: string
  mbl: string
  vessel: string
  voyage: string
  etaAntwerp: string
  pol: string             // Port of Loading
  pod: string             // Port of Discharge
  shipper: string
  consignee: string
  notify: string
  sealNumber: string
  size: string            // e.g. 40H
  hsCode: string
  cargoDescription: string
  pieces: string
  weight: string
  volume: string
  mrn: string
  customsId: string
  keyReference: string
  sourceThreadId: string
  sourceMessageId: string
  detectedAt: string
}

// ─── Draft ───────────────────────────────────────────────────────────────────

export type DraftType = 'instruction_douane' | 'release_reminder' | 'urgent_followup'
export type DraftStatus = 'pending_review' | 'approved' | 'rejected' | 'sent'

export interface EmailDraft {
  id: string
  type: DraftType
  status: DraftStatus
  container: string
  mbl: string
  to: string[]
  cc: string[]
  subject: string
  body: string
  gmailDraftId?: string   // Set once saved to Gmail
  createdAt: string
  reviewedAt?: string
}

// ─── Task Run ────────────────────────────────────────────────────────────────

export interface TaskRun {
  id: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed'
  summary: {
    arrivalNoticesFound: number
    draftsCreated: number
    containersChecked: number
    criticalItems: number
    notificationSent: boolean
  }
  error?: string
}

// ─── App State (stored in KV) ─────────────────────────────────────────────────

export interface AppState {
  containers: Container[]
  drafts: EmailDraft[]
  lastRun: TaskRun | null
  updatedAt: string
}
