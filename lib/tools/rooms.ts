import { tool } from 'ai';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const getRoomsParameters = z.object({
    search: z.string().optional().describe('Search by room name'),
    minCapacity: z.number().optional().describe('Minimum capacity required'),
    maxCapacity: z.number().optional().describe('Maximum capacity limit'),
});

export const getRooms = tool({
    description: 'Get rooms with capacity and name search.',
    inputSchema: getRoomsParameters,
    execute: async ({ search, minCapacity, maxCapacity }: z.infer<typeof getRoomsParameters>) => {
        const where: any = {};
        if (search) where.name = { contains: search, mode: 'insensitive' };

        if (minCapacity !== undefined || maxCapacity !== undefined) {
            where.capacity = {};
            if (minCapacity !== undefined) where.capacity.gte = minCapacity;
            if (maxCapacity !== undefined) where.capacity.lte = maxCapacity;
        }

        const rooms = await prisma.room.findMany({
            where,
            orderBy: { name: 'asc' }
        });
        return { rooms };
    }
});

const getRoomAvailabilityParameters = z.object({
    roomId: z.string(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
});

export const getRoomAvailability = tool({
    description: 'Check if a specific room is available at a given date and time.',
    inputSchema: getRoomAvailabilityParameters,
    execute: async ({ roomId, date, startTime, endTime }: z.infer<typeof getRoomAvailabilityParameters>) => {
        const conflicts = await prisma.meeting.findMany({
            where: {
                roomId,
                date,
                status: { not: 'CANCELED' },
                OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
            },
        });
        const isAvailable = conflicts.length === 0;
        return {
            isAvailable,
            details: isAvailable ? 'Room is available' : 'Room is occupied'
        };
    },
});
