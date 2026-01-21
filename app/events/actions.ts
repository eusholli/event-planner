'use server'

import prisma from '@/lib/prisma'
import { auth } from '@clerk/nextjs/server'
import { revalidatePath } from 'next/cache'

export async function verifyEventPassword(eventId: string, password: string) {
    try {
        const { userId } = await auth()
        if (!userId) {
            return { success: false, error: 'User must be logged in' }
        }

        const event = await prisma.event.findUnique({
            where: { id: eventId },
            select: { password: true, authorizedUserIds: true }
        })

        if (!event) {
            return { success: false, error: 'Event not found' }
        }

        if (event.password === password) {
            // Grant access
            await prisma.event.update({
                where: { id: eventId },
                data: {
                    authorizedUserIds: {
                        push: userId
                    }
                }
            })

            revalidatePath(`/events/${eventId}`)
            return { success: true }
        }

        return { success: false, error: 'Incorrect password' }
    } catch (error) {
        console.error('Password verification error:', error)
        return { success: false, error: 'Verification failed' }
    }
}
