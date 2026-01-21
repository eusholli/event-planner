import { tool } from 'ai';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { canWrite } from '@/lib/roles';
import { findLinkedInUrl, generateBio } from '@/lib/enrichment';

const getAttendeesParameters = z.object({
    search: z.string().optional().describe('Search term for name, title, email, company, bio, description'),
    company: z.string().optional().describe('Filter by specific company'),
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
            const where: any = { eventId };
            if (company) where.company = { contains: company, mode: 'insensitive' };
            if (title) where.title = { contains: title, mode: 'insensitive' };
            if (email) where.email = { contains: email, mode: 'insensitive' };
            if (types && types.length > 0) where.type = { in: types };
            if (isExternal !== undefined) where.isExternal = isExternal;

            if (search) {
                where.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { title: { contains: search, mode: 'insensitive' } },
                    { company: { contains: search, mode: 'insensitive' } },
                    { bio: { contains: search, mode: 'insensitive' } },
                    { companyDescription: { contains: search, mode: 'insensitive' } },
                ];
            }

            const attendees = await prisma.attendee.findMany({
                where,
                take: 50,
                orderBy: { name: 'asc' }
            });
            return { attendees };
        }
    }),

    addAttendee: tool({
        description: 'Add a new attendee.',
        inputSchema: z.object({
            name: z.string(),
            email: z.string(),
            title: z.string(),
            company: z.string(),
        }),
        execute: async ({ name, email, title, company }: { name: string; email: string; title: string; company: string }) => {
            if (!(await canWrite())) {
                return 'Permission Denied: You do not have permission to add attendees.';
            }

            try {
                let linkedin: string | undefined;
                let bio: string | undefined;

                const foundUrl = await findLinkedInUrl(name, company);
                if (foundUrl) linkedin = foundUrl;

                if (linkedin) {
                    const generatedBio = await generateBio(name, company, linkedin);
                    if (generatedBio) bio = generatedBio;
                }

                const attendee = await prisma.attendee.create({
                    data: {
                        name,
                        email,
                        title,
                        company,
                        linkedin,
                        bio,
                        eventId // Scope to event
                    },
                });
                return { message: `Attendee added: ${attendee.name} (${attendee.email})`, attendeeId: attendee.id };
            } catch (e: any) {
                return { error: `Error adding attendee: ${e.message}` };
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
            const attendee = await prisma.attendee.findFirst({
                where: { email: attendeeEmail, eventId },
            });

            if (!attendee) {
                return { error: `Attendee with email ${attendeeEmail} not found in this event.` };
            }

            const conflicts = await prisma.meeting.findMany({
                where: {
                    eventId, // Ensure meetings are also from the same event
                    attendees: { some: { id: attendee.id } },
                    date,
                    status: { not: 'CANCELED' },
                    OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
                },
            });

            if (conflicts.length > 0) {
                return {
                    status: 'Busy',
                    conflicts: conflicts.map(c => `${c.startTime}-${c.endTime}: ${c.title}`)
                };
            }

            return { status: 'Available' };
        }
    }),
});
