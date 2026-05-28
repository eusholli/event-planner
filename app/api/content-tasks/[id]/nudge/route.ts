import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { withAuth, isOwnerOrCanWrite } from '@/lib/with-auth'
import { clerkClient } from '@clerk/nextjs/server'
import { sendPlainEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export const POST = withAuth(async (_request, { params, authCtx }) => {
    const id = (await params).id
    try {
        const task = await prisma.contentTask.findUnique({
            where: { id },
            include: { event: { select: { name: true } } },
        })
        if (!task) return NextResponse.json({ error: 'Content task not found' }, { status: 404 })
        if (!(await isOwnerOrCanWrite(authCtx, task.createdBy))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const recipientIds = [task.assigneeId, ...task.collaboratorIds].filter(Boolean) as string[]
        if (recipientIds.length === 0) {
            return NextResponse.json({ error: 'No assignee or collaborators to notify' }, { status: 400 })
        }

        const client = await clerkClient()
        const { data: users } = await client.users.getUserList({ userId: recipientIds, limit: recipientIds.length })
        const emails = users.map(u => u.emailAddresses[0]?.emailAddress).filter(Boolean) as string[]
        if (emails.length === 0) {
            return NextResponse.json({ error: 'Could not resolve recipient email addresses' }, { status: 400 })
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const taskUrl = `${appUrl}/content?task=${task.id}`

        const dueStr = task.dueDate
            ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'No due date'

        const html = `
<h2 style="margin:0 0 12px">Content task reminder: ${task.title}</h2>
<table style="border-collapse:collapse;font-size:14px">
  ${task.contentType ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Type</td><td>${task.contentType}</td></tr>` : ''}
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Status</td><td>${task.status.replace('_', ' ')}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Due</td><td>${dueStr}</td></tr>
  ${task.event ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Event</td><td>${task.event.name}</td></tr>` : ''}
  ${task.tags.length > 0 ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Tags</td><td>${task.tags.join(', ')}</td></tr>` : ''}
</table>
${task.description ? `<p style="margin:16px 0 0;font-size:14px;color:#374151">${task.description}</p>` : ''}
<p style="margin:20px 0 0">
  <a href="${taskUrl}" style="background:#4f46e5;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:14px">View task</a>
</p>
`

        await Promise.all(emails.map(email =>
            sendPlainEmail(email, `Reminder: ${task.title}`, html)
        ))

        return NextResponse.json({ sent: emails.length })
    } catch (error) {
        console.error('Failed to send nudge:', error)
        return NextResponse.json({ error: 'Failed to send nudge' }, { status: 500 })
    }
}) as any
