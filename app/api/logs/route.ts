import { NextResponse } from 'next/server'
import { getLogs } from '@/lib/runlog'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(getLogs())
}
