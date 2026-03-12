import { tool } from 'ai';
import { z } from 'zod';
import { getRoomsOp, getRoomAvailabilityOp } from './ops';

const getRoomsParameters = z.object({
    search: z.string().optional().describe('Search by room name'),
    minCapacity: z.number().optional().describe('Minimum capacity required'),
    maxCapacity: z.number().optional().describe('Maximum capacity limit'),
});

const getRoomAvailabilityParameters = z.object({
    roomId: z.string(),
    date: z.string(),
    startTime: z.string(),
    endTime: z.string(),
});

export const createRoomTools = (eventId: string) => ({
    getRooms: tool({
        description: 'Get rooms with capacity and name search.',
        inputSchema: getRoomsParameters,
        execute: async ({ search, minCapacity, maxCapacity }: z.infer<typeof getRoomsParameters>) => {
            return await getRoomsOp(eventId, { search, minCapacity, maxCapacity });
        }
    }),

    getRoomAvailability: tool({
        description: 'Check if a specific room is available at a given date and time.',
        inputSchema: getRoomAvailabilityParameters,
        execute: async ({ roomId, date, startTime, endTime }: z.infer<typeof getRoomAvailabilityParameters>) => {
            return await getRoomAvailabilityOp(eventId, { roomId, date, startTime, endTime });
        },
    }),
});
