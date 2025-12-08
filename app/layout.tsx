import { ClerkProvider } from '@/components/auth'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/Navigation'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { RoleSynchronizer } from '@/components/auth/RoleSynchronizer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Event Planner',
  description: 'Manage your events efficiently',
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
          <RoleSynchronizer />
          <Navigation />
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
            {children}
          </main>
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  )
}
