import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { checkRole } from '@/lib/roles'
import { Roles } from '@/lib/constants'

export async function GET() {
    // Check if user is root
    const isRoot = await checkRole(Roles.Root)

    if (!isRoot) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const client = await clerkClient()
        const users = await client.users.getUserList()

        // Backfill missing roles
        const updates = users.data.map(async (user) => {
            if (!user.publicMetadata.role) {
                try {
                    await client.users.updateUserMetadata(user.id, {
                        publicMetadata: {
                            role: Roles.User,
                        },
                    })
                    // Update local object to reflect change immediately in response
                    user.publicMetadata.role = Roles.User
                } catch (err) {
                    console.error(`Failed to backfill role for user ${user.id}:`, err)
                }
            }
        })

        // Wait for all updates to complete (or at least fire them off)
        await Promise.all(updates)

        return NextResponse.json(users)
    } catch (error) {
        console.error('Error fetching users:', error)
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    // Check if user is root
    const isRoot = await checkRole(Roles.Root)

    if (!isRoot) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const { userId, role } = await req.json()

        if (!userId || !role) {
            return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 })
        }

        // Validate role
        if (!Object.values(Roles).includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
        }

        const client = await clerkClient()
        await client.users.updateUserMetadata(userId, {
            publicMetadata: {
                role,
            },
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error updating user role:', error)
        return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 })
    }
}

export async function DELETE(req: Request) {
    // Check if user is root
    const isRoot = await checkRole(Roles.Root)

    if (!isRoot) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const { userId } = await req.json()

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
        }

        const client = await clerkClient()
        await client.users.deleteUser(userId)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting user:', error)
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
    }
}
