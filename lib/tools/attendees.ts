import { tool } from 'ai';
import { z } from 'zod';
import { canWrite } from '@/lib/roles';
import { getAttendeesOp, addAttendeeOp, checkAttendeeAvailabilityOp } from './ops';

const getAttendeesParameters = z.object({
    search: z.string().optional().describe('Search term for name, title, email, company name, bio'),
    company: z.string().optional().describe('Filter by specific company name'),
    title: z.string().optional().describe('Filter by specific title'),
    types: z.array(z.string()).optional().describe('Filter by attendee types'),
    isExternal: z.boolean().optional().describe('Filter by external status'),
    email: z.string().optional().describe('Filter by specific email'),
});

export const createAttendeeTools = (eventId: string) => ({
    getAttendees: tool({
        description: 'Get attendees with advanced search and filtering. Use this to find people.',
        inputSchema: getAttendeesParameters,
        execute: async ({ search, company, title, types, isExternal, email }: z.infer<typeof getAttendeesParameters>) => {
            return await getAttendeesOp(eventId, { search, company, title, types, isExternal, email });
        }
    }),

    addAttendee: tool({
        description: 'Add a new attendee.',
        inputSchema: z.object({
            name: z.string(),
            email: z.string(),
            title: z.string(),
            company: z.string().describe('Company name - will be looked up or created'),
        }),
        execute: async ({ name, email, title, company }: { name: string; email: string; title: string; company: string }) => {
            if (!(await canWrite())) {
                return 'Permission Denied: You do not have permission to add attendees.';
            }
            try {
                return await addAttendeeOp(eventId, { name, email, title, company });
            } catch (e: any) {
                return { error: e.message };
            }
        },
    }),

    checkAttendeeAvailability: tool({
        description: 'Check if a specific attendee is available at a given time.',
        inputSchema: z.object({
            attendeeEmail: z.string(),
            date: z.string().describe('YYYY-MM-DD'),
            startTime: z.string().describe('HH:mm'),
            endTime: z.string().describe('HH:mm'),
        }),
        execute: async ({ attendeeEmail, date, startTime, endTime }: { attendeeEmail: string; date: string; startTime: string; endTime: string }) => {
            return await checkAttendeeAvailabilityOp(eventId, { attendeeEmail, date, startTime, endTime });
        }
    }),
});
