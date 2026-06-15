import { ClerkProvider } from '@/components/auth'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/Navigation'
import { RoleSynchronizer } from '@/components/auth/RoleSynchronizer'
import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import Image from 'next/image'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    template: '%s | Event Planner',
    default: 'Event Planner',
  },
  description: 'Manage your events efficiently',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let showMaintenance = false

  try {
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH !== 'true') {
      const { userId, sessionClaims } = await auth()
      if (userId) {
        const role = (sessionClaims?.metadata as Record<string, unknown>)?.role as string ?? ''
        if (role !== 'root') {
          const settings = await prisma.systemSettings.findFirst({ select: { maintenanceMode: true } })
          showMaintenance = settings?.maintenanceMode ?? false
        }
      }
    }
  } catch {
    // No Clerk middleware context (e.g. 404/excluded static asset paths that
    // still render the root layout). Treat as not-in-maintenance.
  }

  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en">
        <body className={inter.className}>
          <RoleSynchronizer />
          <Navigation />
          <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
            {showMaintenance ? (
              <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center px-4">
                <div className="max-w-md w-full text-center space-y-6">
                  <div className="mx-auto">
                    <Image src="/kenji-logo.svg" alt="Kenji" width={720} height={720} className="w-1/2 sm:w-48 md:w-64 h-auto mx-auto" priority />
                  </div>
                  <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-neutral-900">Under Maintenance</h1>
                    <p className="text-neutral-500">
                      The system is currently undergoing scheduled maintenance.
                      Please check back shortly.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              children
            )}
          </main>
        </body>
      </html>
    </ClerkProvider>
  )
}
