import { clerkClient } from '@clerk/nextjs/server'

/**
 * Resolve Clerk user IDs to their primary email addresses.
 * Throws if any Clerk API call fails (network error, user not found, etc.).
 */
export async function userIdsToEmails(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return []
    const client = await clerkClient()
    const emails: string[] = []
    for (const userId of userIds) {
        const user = await client.users.getUser(userId)
        const primary = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)
            ?? user.emailAddresses[0]
        if (!primary?.emailAddress) {
            throw new Error(`Clerk user ${userId} has no email address`)
        }
        emails.push(primary.emailAddress)
    }
    return emails
}

/**
 * Resolve email addresses to Clerk user IDs.
 * Emails not found in this Clerk instance are silently skipped — the caller
 * is responsible for adding warnings to the import response.
 */
export async function emailsToUserIds(
    emails: string[]
): Promise<{ resolved: { email: string; userId: string }[]; missing: string[] }> {
    if (emails.length === 0) return { resolved: [], missing: [] }
    const client = await clerkClient()
    const resolved: { email: string; userId: string }[] = []
    const missing: string[] = []
    for (const email of emails) {
        const result = await client.users.getUserList({ emailAddress: [email] })
        if (result.data.length > 0) {
            resolved.push({ email, userId: result.data[0].id })
        } else {
            missing.push(email)
        }
    }
    return { resolved, missing }
}
