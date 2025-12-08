import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { Roles } from '@/lib/constants'

export async function POST() {
    const { userId, sessionClaims } = await auth()

    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // If role is already set, do nothing
    if (sessionClaims?.metadata?.role) {
        return NextResponse.json({ success: true, message: 'Role already set' })
    }

    try {
        const client = await clerkClient()
        await client.users.updateUserMetadata(userId, {
            publicMetadata: {
                role: Roles.User,
            },
        })

        return NextResponse.json({ success: true, role: Roles.User })
    } catch (error) {
        console.error('Error initializing user role:', error)
        return NextResponse.json({ error: 'Failed to initialize role' }, { status: 500 })
    }
}
