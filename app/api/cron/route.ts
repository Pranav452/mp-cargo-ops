import { NextRequest, NextResponse } from 'next/server'
import { runDailyTask } from '@/lib/task'

export const maxDuration = 300 // 5 minutes — Vercel Pro limit

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron] Starting daily task run...')
  const run = await runDailyTask()
  console.log('[Cron] Completed:', run.summary)

  return NextResponse.json({ success: true, run })
}
