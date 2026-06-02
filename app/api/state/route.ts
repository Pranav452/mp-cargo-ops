import { NextResponse } from 'next/server'
import { getState, getRunHistory } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [state, runs] = await Promise.all([getState(), getRunHistory()])
  return NextResponse.json({ ...state, runHistory: runs })
}
