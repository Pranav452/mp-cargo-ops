import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface NotificationParams {
  subject: string
  body: string
}

export async function sendNotification({ subject, body }: NotificationParams) {
  if (!process.env.RESEND_API_KEY || !process.env.NOTIFICATION_EMAIL) {
    console.log('[Notify] No RESEND_API_KEY or NOTIFICATION_EMAIL set — skipping')
    return
  }

  await resend.emails.send({
    from: 'MP Cargo Ops <ops@mp-cargo.app>',
    to: [process.env.NOTIFICATION_EMAIL],
    subject,
    text: body,
  })
}
