
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { canWrite } from '@/lib/roles';
import { findLinkedInUrl, generateBio } from '@/lib/enrichment';
import { sendCalendarInvites } from '@/lib/calendar-sync';

// Allow streaming responses up to 300 seconds
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();

        // 1. Fetch API Key from EventSettings
        const settings = await prisma.eventSettings.findFirst();
        if (!settings?.geminiApiKey) {
            console.error('Chat API: Missing API Key');
            return new Response('Gemini API Key not configured in Event Settings.', { status: 500 });
        }

        const google = createGoogleGenerativeAI({
            apiKey: settings.geminiApiKey,
        });

        // Construct System Prompt with Event Context
        const systemPrompt = `
You are the AI assistant for the event "${settings.name}".
Event Details:
- Start Date: ${settings.startDate.toISOString().split('T')[0]}
- End Date: ${settings.endDate.toISOString().split('T')[0]}
- Timezone: ${settings.timezone || 'UTC'}
- Current Date: ${new Date().toISOString().split('T')[0]}

Use this context to answer questions. If the user mentions "Day 1", it refers to the start date.
Assume all queries are relative to this event unless specified otherwise.

IMPORTANT:
- When you receive tool outputs, process them and provide the FINAL ANSWER immediately.
- Do NOT output status messages like "I am processing", "I have retrieved the data", or "This will take a moment".
- If the result requires complex analysis, perform the analysis and output the result in a single response.

VERIFICATION & ACCURACY:
- You must STRICTLY use the data provided by the tools. Do NOT invent meetings, attendees, or details.
- When performing counts (e.g. "how many meetings"), you MUST manually count the items in the tool output JSON before answering. Double-check your count.
- If the tool returns no data (empty array), state clearly that there are no results. Do not make up plausible data.
- Quote specific details from the tool output to support your answer when possible.
`;

        const result = await streamText({
            model: google('gemini-2.0-flash'),
            system: systemPrompt,
            messages,
            onError: (error) => {
                console.error('Chat API Stream Error:', error);
            },
            tools: {

                listMeetings: tool({
                    description: 'List meetings with optional filtering by date, status, or search query.',
                    parameters: z.object({
                        date: z.string().optional().describe('Filter by date (YYYY-MM-DD)'),
                        status: z.enum(['STARTED', 'COMPLETED', 'CANCELED']).optional().describe('Filter by meeting status'),
                        search: z.string().optional().describe('Search query for title, purpose, or attendees'),
                    }),
                    execute: async ({ date, status, search }: { date?: string, status?: 'STARTED' | 'COMPLETED' | 'CANCELED', search?: string }) => {
                        const where: any = {};
                        if (date) where.date = date;
                        if (status) where.status = status;
                        if (search) {
                            where.OR = [
                                { title: { contains: search, mode: 'insensitive' } },
                                { purpose: { contains: search, mode: 'insensitive' } },
                                { attendees: { some: { name: { contains: search, mode: 'insensitive' } } } },
                            ];
                        }
                        const meetings = await prisma.meeting.findMany({
                            where,
                            include: { room: true, attendees: true },
                            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
                            take: 20, // Limit results
                        });
                        return { meetings };
                    },
                }),

                createMeeting: tool({
                    description: 'Create a new meeting. Requires Title, Date, Start Time, End Time. Optional: Room, Attendees.',
                    parameters: z.object({
                        title: z.string(),
                        purpose: z.string().optional(),
                        date: z.string().describe('YYYY-MM-DD'),
                        startTime: z.string().describe('HH:mm'),
                        endTime: z.string().describe('HH:mm'),
                        roomId: z.string().optional(),
                        attendeeEmails: z.array(z.string()).optional(),
                    }),
                    execute: async ({ title, purpose, date, startTime, endTime, roomId, attendeeEmails }: { title: string, purpose?: string, date: string, startTime: string, endTime: string, roomId?: string, attendeeEmails?: string[] }) => {
                        // RBAC Check
                        if (!(await canWrite())) {
                            return 'Permission Denied: You do not have permission to create meetings.';
                        }

                        // Availability Check (Simplified)
                        // Check Room
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

                        // Resolve Attendees
                        let attendeeIds: string[] = [];
                        if (attendeeEmails && attendeeEmails.length > 0) {
                            const attendees = await prisma.attendee.findMany({
                                where: { email: { in: attendeeEmails } },
                            });
                            attendeeIds = attendees.map(a => a.id);

                            if (attendees.length !== attendeeEmails.length) {
                                // Warn about missing
                                // For now just proceed with found ones or return error?
                                // Let's proceed with found ones but note it? 
                                // Simpler to just use found ones.
                            }
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
                                    status: 'STARTED',
                                    attendees: { connect: attendeeIds.map(id => ({ id })) },
                                },
                                include: { room: true, attendees: true },
                            });

                            // Trigger Calendar Invite sync
                            if (meeting.date && meeting.startTime && meeting.endTime) {
                                // Fire and forget
                                sendCalendarInvites(meeting as any).catch(console.error);
                            }

                            return { message: `Meeting created successfully: ${meeting.id}`, meetingId: meeting.id };
                        } catch (error) {
                            console.error('Error creating meeting:', error);
                            return { error: 'Failed to create meeting' };
                        }
                    },
                }),

                cancelMeeting: tool({
                    description: 'Cancel a meeting by ID.',
                    parameters: z.object({
                        id: z.string(),
                    }),
                    execute: async ({ id: meetingId }: { id: string }) => {
                        // RBAC Check
                        if (!(await canWrite())) {
                            return 'Permission Denied: You do not have permission to cancel meetings.';
                        }
                        try {
                            await prisma.meeting.update({
                                where: { id: meetingId },
                                data: { status: 'CANCELED' },
                            });
                            return { message: `Meeting ${meetingId} canceled successfully` };
                        } catch (e: any) {
                            return { error: `Error canceling meeting: ${e.message}` };
                        }
                    },
                }),

                listAttendees: tool({
                    description: 'List all attendees.',
                    parameters: z.object({}),
                    execute: async () => {
                        const attendees = await prisma.attendee.findMany({
                            take: 50,
                            orderBy: { name: 'asc' },
                        });
                        return { attendees };
                    },
                }),

                checkAttendeeAvailability: tool({
                    description: 'Check if a specific attendee is available at a given time.',
                    parameters: z.object({
                        attendeeEmail: z.string(),
                        date: z.string().describe('YYYY-MM-DD'),
                        startTime: z.string().describe('HH:mm'),
                        endTime: z.string().describe('HH:mm'),
                    }),
                    execute: async ({ attendeeEmail, date, startTime, endTime }: { attendeeEmail: string, date: string, startTime: string, endTime: string }) => {
                        const attendee = await prisma.attendee.findUnique({
                            where: { email: attendeeEmail },
                        });

                        if (!attendee) {
                            return { error: `Attendee with email ${attendeeEmail} not found.` };
                        }

                        const conflicts = await prisma.meeting.findMany({
                            where: {
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

                addAttendee: tool({
                    description: 'Add a new attendee.',
                    parameters: z.object({
                        name: z.string(),
                        email: z.string(),
                        title: z.string(),
                        company: z.string(),
                    }),
                    execute: async ({ name, email, title, company }: { name: string, email: string, title: string, company: string }) => {
                        // RBAC Check
                        if (!(await canWrite())) {
                            return 'Permission Denied: You do not have permission to add attendees.';
                        }

                        try {
                            // Auto-enrichment logic similar to existing route
                            let linkedin: string | undefined;
                            let bio: string | undefined;

                            const foundUrl = await findLinkedInUrl(name, company);
                            if (foundUrl) linkedin = foundUrl;

                            if (linkedin) {
                                const generatedBio = await generateBio(name, company, linkedin);
                                if (generatedBio) bio = generatedBio;
                            }

                            const attendee = await prisma.attendee.create({
                                data: { name, email, title, company, linkedin, bio },
                            });
                            return { message: `Attendee added: ${attendee.name} (${attendee.email})`, attendeeId: attendee.id };
                        } catch (e: any) {
                            return { error: `Error adding attendee: ${e.message}` };
                        }
                    },
                }),

                getRoomAvailability: tool({
                    description: 'Check if a room is available at a specific date and time.',
                    parameters: z.object({
                        roomId: z.string(),
                        date: z.string(),
                        startTime: z.string(),
                        endTime: z.string(),
                    }),
                    execute: async ({ roomId, date, startTime, endTime }: { roomId: string, date: string, startTime: string, endTime: string }) => {
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
                }),

                listRooms: tool({
                    description: 'List all available rooms and their capacities.',
                    parameters: z.object({}),
                    execute: async () => {
                        const rooms = await prisma.room.findMany();
                        return { rooms };
                    }
                }),

                get_meetings: tool({
                    description: 'Get meetings with comprehensive filtering options (date, room, status, tags, etc). Use this for complex queries.',
                    parameters: z.object({
                        date: z.string().optional().describe('Filter by date (YYYY-MM-DD)'),
                        roomId: z.string().optional().describe('Filter by Room ID'),
                        search: z.string().optional().describe('Search term for title, purpose, location, details, attendee names'),
                        statuses: z.array(z.string()).optional().describe('List of statuses to filter by (e.g. ["STARTED", "COMPLETED"])'),
                        tags: z.array(z.string()).optional().describe('List of tags to include'),
                        meetingTypes: z.array(z.string()).optional().describe('List of meeting types to filter by'),
                        attendeeIds: z.array(z.string()).optional().describe('List of attendee IDs to filter by'),
                        isApproved: z.boolean().optional().describe('Filter by approval status'),
                        calendarInviteSent: z.boolean().optional().describe('Filter by calendar invite status'),
                    }),
                    execute: async ({ date, roomId, search, statuses, tags, meetingTypes, attendeeIds, isApproved, calendarInviteSent }) => {
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
                })
            },
            // @ts-ignore
            maxSteps: 5,
        });

        return (result as any).toDataStreamResponse({
            getErrorMessage: (error: any) => {
                return error.message || String(error);
            }
        });
    } catch (error: any) {
        console.error('Chat API Error:', error);
        return new Response(`Chat API Error: ${error.message || error}`, { status: 500 });
    }
}
