
import prisma from '@/lib/prisma'

/**
 * Checks if an event is editable based on its ID or status string.
 * An event is considered editable if its status is NOT 'OCCURRED'.
 * 
 * @param eventIdOrStatus The ID of the event to check, or the status string itself.
 * @returns Promise<boolean> true if editable, false if locked.
 */
export async function isEventEditable(eventIdOrStatus: string): Promise<boolean> {
    // If it looks like a status string (uppercased), check directly
    if (['PIPELINE', 'COMMITTED', 'OCCURRED', 'CANCELED'].includes(eventIdOrStatus)) {
        return eventIdOrStatus !== 'OCCURRED'
    }

    // Otherwise assume it's an ID and fetch
    try {
        const event = await prisma.event.findUnique({
            where: { id: eventIdOrStatus },
            select: { status: true }
        })

        if (!event) return false // Fail safe: if event not found, treat as locked/error

        return event.status !== 'OCCURRED'

    } catch (error) {
        console.error('Error checking event editable status:', error)
        return false // Fail safe
    }
}

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
