import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { Roles } from '@/lib/constants'
import { withAuth, type AuthContext } from '@/lib/with-auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function handleGET(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const { searchParams } = new URL(req.url)
        const page = parseInt(searchParams.get('page') || '1', 10)
        const limit = parseInt(searchParams.get('limit') || '10', 10)
        const query = searchParams.get('search') || ''

        const client = await clerkClient()
        const users = await client.users.getUserList({
            limit,
            offset: (page - 1) * limit,
            query,
        })

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

        const clerkUserIds = users.data.map(u => u.id)
        const [linkedViber, pendingViber, profiles] = await Promise.all([
            prisma.viberUser.findMany({
                where: { clerkUserId: { in: clerkUserIds } },
                select: { clerkUserId: true },
            }),
            prisma.viberLinkCode.findMany({
                where: {
                    clerkUserId: { in: clerkUserIds },
                    consumedAt: null,
                    expiresAt: { gt: new Date() },
                },
                select: { clerkUserId: true },
                distinct: ['clerkUserId'],
            }),
            prisma.userProfile.findMany({
                where: { clerkUserId: { in: clerkUserIds } },
                select: { clerkUserId: true, regions: true },
            }),
        ])
        const linkedSet = new Set(linkedViber.map(v => v.clerkUserId))
        const pendingSet = new Set(pendingViber.map(v => v.clerkUserId))
        const profileMap = Object.fromEntries(profiles.map(p => [p.clerkUserId, p.regions]))

        return NextResponse.json({
            data: users.data.map(u => ({
                ...u,
                viberLinked: linkedSet.has(u.id),
                viberPending: !linkedSet.has(u.id) && pendingSet.has(u.id),
                regions: profileMap[u.id] ?? [],
            })),
            totalCount: users.totalCount,
        })
    } catch (error) {
        console.error('Error fetching users:', error)
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

async function handlePOST(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const { userId, role, regions } = await req.json()

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
        }

        if (role === undefined && regions === undefined) {
            return NextResponse.json({ error: 'Must provide role or regions to update' }, { status: 400 })
        }

        if (role !== undefined) {
            if (!Object.values(Roles).includes(role)) {
                console.error(`Invalid role attempted: ${role}. Valid roles: ${Object.values(Roles).join(', ')}`)
                return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 })
            }
            const client = await clerkClient()
            await client.users.updateUserMetadata(userId, { publicMetadata: { role } })
        }

        if (regions !== undefined) {
            await prisma.userProfile.upsert({
                where: { clerkUserId: userId },
                update: { regions },
                create: { clerkUserId: userId, regions },
            })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Error updating user metadata:', error)
        return NextResponse.json({ error: error.message || 'Failed to update user metadata' }, { status: 500 })
    }
}

async function handleDELETE(req: Request, ctx: { params: Promise<Record<string, string>>; authCtx: AuthContext }) {
    try {
        const { userId } = await req.json()

        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
        }

        // Clean up all DB records tied to this user
        await Promise.all([
            prisma.userProfile.deleteMany({ where: { clerkUserId: userId } }),
            prisma.viberUser.deleteMany({ where: { clerkUserId: userId } }),
            prisma.viberLinkCode.deleteMany({ where: { clerkUserId: userId } }),
            prisma.intelligenceSubscription.deleteMany({ where: { userId } }),
        ])

        // Remove user from any event authorizedUserIds arrays
        const eventsWithUser = await prisma.event.findMany({
            where: { authorizedUserIds: { has: userId } },
            select: { id: true, authorizedUserIds: true },
        })
        await Promise.all(eventsWithUser.map(event =>
            prisma.event.update({
                where: { id: event.id },
                data: { authorizedUserIds: event.authorizedUserIds.filter(id => id !== userId) },
            })
        ))

        const client = await clerkClient()
        await client.users.deleteUser(userId)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error deleting user:', error)
        return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
    }
}

export const GET = withAuth(handleGET, { requireRole: 'manageEvents' }) as any
export const POST = withAuth(handlePOST, { requireRole: 'manageEvents' }) as any
export const DELETE = withAuth(handleDELETE, { requireRole: 'manageEvents' }) as any
