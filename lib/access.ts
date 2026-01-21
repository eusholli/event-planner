import { Roles } from './constants'

interface EventWithAccess {
    authorizedUserIds: string[]
}

export const hasEventAccess = (event: EventWithAccess, userId: string, role?: string | null): boolean => {
    if (!role) return false

    // Root and Marketing have global access (no userId needed)
    if (role === Roles.Root || role === Roles.Marketing) {
        return true
    }

    if (!userId) return false

    // Admin and User need explicit access
    if (role === Roles.Admin || role === Roles.User) {
        return event.authorizedUserIds.includes(userId)
    }

    return false
}
