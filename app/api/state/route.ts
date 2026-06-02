import { NextResponse } from 'next/server'
import { getState, getRunHistory } from '@/lib/store'

export async function GET() {
  const [state, runs] = await Promise.all([getState(), getRunHistory()])
  return NextResponse.json({ ...state, runHistory: runs })
}
