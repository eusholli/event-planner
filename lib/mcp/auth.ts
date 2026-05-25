import { clerkClient } from '@clerk/nextjs/server'
import { Roles } from '@/lib/constants'

/**
 * Fetches the app role for a Clerk user ID (used after verifyClerkToken succeeds).
 * Roles are stored in Clerk publicMetadata.role.
 */
export async function getRoleForUser(userId: string): Promise<string> {
    const clerk = await clerkClient()
    const user = await clerk.users.getUser(userId)
    return (user.publicMetadata?.role as string) ?? ''
}

/** Read tools are available to root, marketing, and cron (CRON_SECRET_KEY) callers. */
export function canRead(role: string): boolean {
    return role === Roles.Root || role === Roles.Marketing || role === 'cron'
}

/** Write tools are available to root only. */
export function canWrite(role: string): boolean {
    return role === Roles.Root
}
