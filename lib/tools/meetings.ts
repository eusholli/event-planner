import { tool } from 'ai';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { canWrite } from '@/lib/roles';
import { sendCalendarInvites } from '@/lib/calendar-sync';

const getMeetingsParameters = z.object({
    date: z.string().optional().describe('Filter by date (YYYY-MM-DD)'),
    roomId: z.string().optional().describe('Filter by Room ID'),
    search: z.string().optional().describe('Search term for title, purpose, location, details, attendee names'),
    statuses: z.array(z.string()).optional().describe('List of statuses to filter by (e.g. ["PIPELINE", "CONFIRMED", "OCCURRED", "CANCELED"])'),
    tags: z.array(z.string()).optional().describe('List of tags to include'),
    meetingTypes: z.array(z.string()).optional().describe('List of meeting types to filter by'),
    attendeeIds: z.array(z.string()).optional().describe('List of attendee IDs to filter by'),
    isApproved: z.boolean().optional().describe('Filter by approval status'),
    calendarInviteSent: z.boolean().optional().describe('Filter by calendar invite status'),
});

export const getMeetings = tool({
    description: 'Get meetings with comprehensive filtering options. Use this to find meetings by date, room, status, or search text.',
    inputSchema: getMeetingsParameters,
    execute: async ({ date, roomId, search, statuses, tags, meetingTypes, attendeeIds, isApproved, calendarInviteSent }: z.infer<typeof getMeetingsParameters>) => {
        const where: any = {};

        if (date) where.date = date;
        if (roomId) where.roomId = roomId;

        if (statuses && statuses.length > 0) where.status = { in: statuses };
        if (tags && tags.length > 0) where.tags = { hasSome: tags };
        if (meetingTypes && meetingTypes.length > 0) where.meetingType = { in: meetingTypes };
        if (attendeeIds && attendeeIds.length > 0) {
            where.attendees = {
                some: {
                    id: { in: attendeeIds }
                }
            };
        }

        if (isApproved !== undefined) where.isApproved = isApproved;
        if (calendarInviteSent !== undefined) where.calendarInviteSent = calendarInviteSent;

        if (search) {
            where.OR = [
                { title: { contains: search, mode: 'insensitive' } },
                { purpose: { contains: search, mode: 'insensitive' } },
                { location: { contains: search, mode: 'insensitive' } },
                { otherDetails: { contains: search, mode: 'insensitive' } },
                { attendees: { some: { name: { contains: search, mode: 'insensitive' } } } },
            ];
        }

        const meetings = await prisma.meeting.findMany({
            where,
            include: { room: true, attendees: true },
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        });

        return { meetings };
    },
});

const createMeetingParameters = z.object({
    title: z.string(),
    purpose: z.string().optional(),
    date: z.string().describe('YYYY-MM-DD'),
    startTime: z.string().describe('HH:mm'),
    endTime: z.string().describe('HH:mm'),
    roomId: z.string().optional(),
    attendeeEmails: z.array(z.string()).optional(),
});

export const createMeeting = tool({
    description: 'Create a new meeting. Requires Title, Date, Start Time, End Time. Optional: Room, Attendees.',
    inputSchema: createMeetingParameters,
    execute: async ({ title, purpose, date, startTime, endTime, roomId, attendeeEmails }: z.infer<typeof createMeetingParameters>) => {
        if (!(await canWrite())) {
            return 'Permission Denied: You do not have permission to create meetings.';
        }

        if (roomId) {
            const roomConflicts = await prisma.meeting.findMany({
                where: {
                    roomId,
                    date,
                    OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
                },
            });
            if (roomConflicts.length > 0) return 'Error: Room is already booked for this time slot.';
        }

        let attendeeIds: string[] = [];
        if (attendeeEmails && attendeeEmails.length > 0) {
            const attendees = await prisma.attendee.findMany({
                where: { email: { in: attendeeEmails } },
            });
            attendeeIds = attendees.map(a => a.id);
        }

        try {
            const meeting = await prisma.meeting.create({
                data: {
                    title,
                    purpose,
                    date,
                    startTime,
                    endTime,
                    roomId,
                    status: 'PIPELINE',
                    attendees: { connect: attendeeIds.map(id => ({ id })) },
                },
                include: { room: true, attendees: true },
            });

            if (meeting.date && meeting.startTime && meeting.endTime) {
                sendCalendarInvites(meeting as any).catch(console.error);
            }

            return { message: `Meeting created successfully: ${meeting.id}`, meetingId: meeting.id };
        } catch (error) {
            console.error('Error creating meeting:', error);
            return { error: 'Failed to create meeting' };
        }
    },
});

export const cancelMeeting = tool({
    description: 'Cancel a meeting by ID.',
    inputSchema: z.object({
        id: z.string(),
    }),
    execute: async ({ id: meetingId }: { id: string }) => {
        if (!(await canWrite())) {
            return 'Permission Denied: You do not have permission to cancel meetings.';
        }
        try {
            await prisma.meeting.update({
                where: { id: meetingId },
                data: {
                    status: 'CANCELED',
                    roomId: null,
                    location: null
                },
            });
            return { message: `Meeting ${meetingId} canceled successfully` };
        } catch (e: any) {
            return { error: `Error canceling meeting: ${e.message}` };
        }
    },
});
