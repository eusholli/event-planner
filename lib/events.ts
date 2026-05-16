
import prisma from '@/lib/prisma'

/**
 * Resolves an event ID or Slug to the Event ID (CUID).
 * 
 * @param idOrSlug The ID or Slug to resolve.
 * @returns Promise<string | null> The Event ID if found, null otherwise.
 */
export async function resolveEventId(idOrSlug: string): Promise<string | null> {
    if (!idOrSlug) return null

    try {
        // Try to find by ID first (fastest unique index)
        const eventById = await prisma.event.findUnique({
            where: { id: idOrSlug },
            select: { id: true }
        })
        if (eventById) return eventById.id

        // Try to find by Slug
        const eventBySlug = await prisma.event.findUnique({
            where: { slug: idOrSlug },
            select: { id: true }
        })
        if (eventBySlug) return eventBySlug.id

        return null
    } catch (error) {
        console.error('Error resolving event ID:', error)
        return null
    }
}
