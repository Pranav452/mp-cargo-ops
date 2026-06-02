import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function getOAuthClient(): OAuth2Client {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail`
  )
  client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  })
  return client
}

export function getGmailClient() {
  const auth = getOAuthClient()
  return google.gmail({ version: 'v1', auth })
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface RawThread {
  id: string
  subject: string
  snippet: string
  from: string
  to: string[]
  cc: string[]
  date: string
  body: string
  messageId: string
  messages: RawMessage[]
}

export interface RawMessage {
  id: string
  from: string
  to: string[]
  date: string
  snippet: string
  body: string
}

export async function searchThreads(
  query: string,
  maxResults = 20
): Promise<RawThread[]> {
  const gmail = getGmailClient()

  const listRes = await gmail.users.threads.list({
    userId: 'me',
    q: query,
    maxResults,
  })

  const threadIds = listRes.data.threads?.map((t) => t.id!) ?? []
  if (threadIds.length === 0) return []

  const threads = await Promise.all(
    threadIds.map((id) => fetchThread(id))
  )

  return threads.filter(Boolean) as RawThread[]
}

export async function fetchThread(threadId: string): Promise<RawThread | null> {
  const gmail = getGmailClient()

  try {
    const res = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    })

    const messages = res.data.messages ?? []
    if (messages.length === 0) return null

    const firstMsg = messages[0]
    const headers = firstMsg.payload?.headers ?? []

    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

    const subject = getHeader('Subject')
    const from = getHeader('From')
    const to = getHeader('To').split(',').map((s) => s.trim()).filter(Boolean)
    const cc = getHeader('Cc').split(',').map((s) => s.trim()).filter(Boolean)
    const date = getHeader('Date')

    const parsedMessages: RawMessage[] = messages.map((msg) => {
      const msgHeaders = msg.payload?.headers ?? []
      const getH = (n: string) =>
        msgHeaders.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value ?? ''

      return {
        id: msg.id!,
        from: getH('From'),
        to: getH('To').split(',').map((s) => s.trim()).filter(Boolean),
        date: getH('Date'),
        snippet: msg.snippet ?? '',
        body: extractBody(msg.payload),
      }
    })

    return {
      id: threadId,
      subject,
      snippet: firstMsg.snippet ?? '',
      from,
      to,
      cc,
      date,
      body: parsedMessages.map((m) => m.body).join('\n\n---\n\n'),
      messageId: firstMsg.id!,
      messages: parsedMessages,
    }
  } catch (e) {
    console.error(`Failed to fetch thread ${threadId}:`, e)
    return null
  }
}

function extractBody(payload: any): string {
  if (!payload) return ''

  // Direct body
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  // Multipart — find text/plain first, then text/html
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf-8')
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      const body = extractBody(part)
      if (body) return body
    }
  }

  return ''
}

// ─── Draft ────────────────────────────────────────────────────────────────────

export interface CreateDraftParams {
  to: string[]
  cc?: string[]
  subject: string
  body: string
  replyToMessageId?: string
  replyToThreadId?: string
}

export async function createGmailDraft(params: CreateDraftParams): Promise<string> {
  const gmail = getGmailClient()

  const rawParts = [
    `To: ${params.to.join(', ')}`,
    params.cc?.length ? `Cc: ${params.cc.join(', ')}` : null,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    params.body,
  ]
  const messageParts = rawParts.filter((line) => line !== null).join('\r\n')

  const encoded = Buffer.from(messageParts).toString('base64url')

  const draftBody: any = { message: { raw: encoded } }
  if (params.replyToThreadId) {
    draftBody.message.threadId = params.replyToThreadId
  }

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: draftBody,
  })

  return res.data.id!
}

export async function sendDraft(draftId: string): Promise<void> {
  const gmail = getGmailClient()
  await gmail.users.drafts.send({
    userId: 'me',
    requestBody: { id: draftId },
  })
}

export async function deleteDraft(draftId: string): Promise<void> {
  const gmail = getGmailClient()
  await gmail.users.drafts.delete({ userId: 'me', id: draftId })
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────

export function getAuthUrl(): string {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    prompt: 'consent',
  })
}

export async function exchangeCodeForTokens(code: string) {
  const client = getOAuthClient()
  const { tokens } = await client.getToken(code)
  return tokens
}
