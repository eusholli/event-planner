import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { Roles } from '@/lib/constants'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'

const postHandler = withAuth(async (req, { authCtx }) => {
    const { sessionClaims } = await auth()

    // If role is already set, do nothing
    if (sessionClaims?.metadata?.role) {
        return NextResponse.json({ success: true, message: 'Role already set' })
    }

    try {
        const client = await clerkClient()
        await client.users.updateUserMetadata(authCtx.userId, {
            publicMetadata: {
                role: Roles.User,
            },
        })

        return NextResponse.json({ success: true, role: Roles.User })
    } catch (error) {
        console.error('Error initializing user role:', error)
        return NextResponse.json({ error: 'Failed to initialize role' }, { status: 500 })
    }
}, { requireAuth: true })

export const POST = postHandler as any
