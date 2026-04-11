import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'WSU Graduate School Tools',
  description: 'Tools for WSU Graduate School',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

