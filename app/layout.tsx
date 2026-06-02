import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MP Cargo — Ops Dashboard',
  description: 'Container tracking & arrival notice management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
