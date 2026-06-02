import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, getAuthUrl } from '@/lib/gmail'

// GET /api/gmail — redirect to Google OAuth
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    // Redirect to Google OAuth
    return NextResponse.redirect(getAuthUrl())
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code)

  return NextResponse.json({
    message: 'Copy the refresh_token below into your .env as GMAIL_REFRESH_TOKEN',
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    note: 'The refresh_token only appears once. Save it immediately.',
  })
}
