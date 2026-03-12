import { tool } from 'ai';
import { z } from 'zod';
import { canWrite } from '@/lib/roles';
import { getMeetingsOp, createMeetingOp, cancelMeetingOp } from './ops';

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

const createMeetingParameters = z.object({
    title: z.string(),
    purpose: z.string().optional(),
    date: z.string().describe('YYYY-MM-DD'),
    startTime: z.string().describe('HH:mm'),
    endTime: z.string().describe('HH:mm'),
    roomId: z.string().optional(),
    attendeeEmails: z.array(z.string()).optional(),
});

export const createMeetingTools = (eventId: string) => ({
    getMeetings: tool({
        description: 'Get meetings with comprehensive filtering options. Use this to find meetings by date, room, status, or search text.',
        inputSchema: getMeetingsParameters,
        execute: async ({ date, roomId, search, statuses, tags, meetingTypes, attendeeIds, isApproved, calendarInviteSent }: z.infer<typeof getMeetingsParameters>) => {
            return await getMeetingsOp(eventId, { date, roomId, search, statuses, tags, meetingTypes, attendeeIds, isApproved, calendarInviteSent });
        },
    }),

    createMeeting: tool({
        description: 'Create a new meeting. Requires Title, Date, Start Time, End Time. Optional: Room, Attendees.',
        inputSchema: createMeetingParameters,
        execute: async ({ title, purpose, date, startTime, endTime, roomId, attendeeEmails }: z.infer<typeof createMeetingParameters>) => {
            if (!(await canWrite())) {
                return 'Permission Denied: You do not have permission to create meetings.';
            }
            try {
                return await createMeetingOp(eventId, { title, purpose, date, startTime, endTime, roomId, attendeeEmails });
            } catch (e: any) {
                return { error: e.message };
            }
        },
    }),

    cancelMeeting: tool({
        description: 'Cancel a meeting by ID.',
        inputSchema: z.object({
            id: z.string(),
        }),
        execute: async ({ id }: { id: string }) => {
            if (!(await canWrite())) {
                return 'Permission Denied: You do not have permission to cancel meetings.';
            }
            try {
                return await cancelMeetingOp(eventId, id);
            } catch (e: any) {
                return { error: e.message };
            }
        },
    }),
});
