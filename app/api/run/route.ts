import { NextRequest, NextResponse } from 'next/server'
import { runDailyTask } from '@/lib/task'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  // Simple secret check — add proper auth (e.g. NextAuth) in production
  const { secret } = await req.json().catch(() => ({}))
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Manual Run] Starting task...')
  const run = await runDailyTask()

  return NextResponse.json({ success: run.status === 'completed', run })
}
