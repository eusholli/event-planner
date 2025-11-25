import { ClerkProvider } from '@/components/auth'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/Navigation'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Event Planner',
  description: 'Executive Meeting Coordinator',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          <Navigation />
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
            {children}
          </main>
        </body>
      </html>
    </ClerkProvider>
  )
}
