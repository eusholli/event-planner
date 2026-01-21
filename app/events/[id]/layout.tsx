import { auth } from '@clerk/nextjs/server'
import prisma from '@/lib/prisma'
import { resolveEventId } from '@/lib/events'
import { hasEventAccess } from '@/lib/access'
import { PasswordGate } from '@/components/events/PasswordGate'
import { redirect, notFound } from 'next/navigation'
import { Roles } from '@/lib/constants'

export default async function EventLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ id: string }>
}) {
    const { id: rawId } = await params
    const id = await resolveEventId(rawId)

    if (!id) {
        notFound()
    }

    const event = await prisma.event.findUnique({
        where: { id },
    })

    if (!event) {
        notFound()
    }

    const { sessionClaims, userId } = await auth()

    // If auth is disabled, allow access as root
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') {
        return <>{children}</>
    }

    if (!userId) {
        // Middleware should catch this, but just in case
        redirect('/sign-in')
    }

    const role = sessionClaims?.metadata?.role as string

    // Check if user has direct access
    // We cast event to any because hasEventAccess expects an object with authorizedUserIds
    // and our potential dirty prisma types might cause issues if not fully regenerated, 
    // but runtime is fine.
    const hasAccess = hasEventAccess(event as any, userId, role)

    if (hasAccess) {
        return <>{children}</>
    }

    // If no direct access, check if password protection is enabled
    if (event.password) {
        return <PasswordGate eventId={event.id} eventName={event.name} />
    }

    // If no password and no access -> Access Denied
    redirect('/access-denied')
}
