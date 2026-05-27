import { tool } from 'ai';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const getContentTasksParameters = z.object({
    status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELED']).optional(),
    contentType: z.string().optional().describe('Filter by content type, e.g. Newsletter, Podcast'),
    from: z.string().optional().describe('ISO date — inclusive lower bound for dueDate'),
    to: z.string().optional().describe('ISO date — inclusive upper bound for dueDate'),
    onlyLinked: z.boolean().optional().describe('If true, only tasks linked to this event'),
});

export const createContentTools = (eventId: string) => ({
    getContentTasks: tool({
        description: 'List editorial content tasks (newsletters, podcasts, articles, recaps). Optionally scoped to tasks linked to the current event.',
        inputSchema: getContentTasksParameters,
        execute: async ({ status, contentType, from, to, onlyLinked }) => {
            const where: any = {};
            if (status) where.status = status;
            if (contentType) where.contentType = contentType;
            if (onlyLinked) where.eventId = eventId;
            if (from || to) {
                where.dueDate = {};
                if (from) where.dueDate.gte = new Date(from);
                if (to) where.dueDate.lte = new Date(to);
            }
            const tasks = await prisma.contentTask.findMany({
                where,
                include: { event: { select: { id: true, name: true, slug: true } } },
                orderBy: [{ dueDate: 'asc' }],
                take: 100,
            });
            return tasks.map(t => ({
                id: t.id,
                title: t.title,
                contentType: t.contentType,
                status: t.status,
                dueDate: t.dueDate?.toISOString() ?? null,
                tags: t.tags,
                event: t.event ? { id: t.event.id, name: t.event.name, slug: t.event.slug } : null,
            }));
        },
    }),
});
