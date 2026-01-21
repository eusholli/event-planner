import { tool } from 'ai';
import { z } from 'zod';
import { canWrite } from '@/lib/roles';

const getNavigationLinksParameters = z.object({
    resource: z.enum(['meeting', 'meetings', 'attendee', 'attendees']).describe('The resource to link to'),
    action: z.enum(['create', 'read', 'update']).describe('The action to perform'),
    id: z.string().optional().describe('ID of the resource to link to (required for read/update)'),
});

export const createNavigationTools = (eventId: string, eventSlug: string) => ({
    getNavigationLinks: tool({
        description: 'Get navigation URLs for specific resources and actions. Use this to provide direct links to create, edit, or view items in the UI.',
        inputSchema: getNavigationLinksParameters,
        execute: async ({ resource, action, id }: z.infer<typeof getNavigationLinksParameters>) => {
            // Normalize resource
            const normalizedResource = resource.startsWith('meeting') ? 'meeting' : 'attendee';
            const hasWrite = await canWrite();

            // Use the slug for the URL if available, otherwise fallback to ID (though slug should always be there if passed correctly)
            const slugToUse = eventSlug || eventId;
            const baseUrl = `/events/${slugToUse}`;

            if (action === 'create') {
                if (!hasWrite) return { error: `Permission Denied: You do not have permission to create ${normalizedResource}s.` };
                if (normalizedResource === 'meeting') return { url: `${baseUrl}/new-meeting` };
                if (normalizedResource === 'attendee') return { url: `${baseUrl}/attendees` };
            }

            if (action === 'update') {
                if (!hasWrite) return { error: `Permission Denied: You do not have permission to update ${normalizedResource}s.` };
                if (!id) return { error: 'ID is required for update action.' };

                if (normalizedResource === 'meeting') return { url: `${baseUrl}/dashboard?meetingId=${id}` };
                if (normalizedResource === 'attendee') return { url: `${baseUrl}/attendees?attendeeId=${id}` };
            }

            if (action === 'read') {
                if (!id) return { url: normalizedResource === 'meeting' ? `${baseUrl}/dashboard` : `${baseUrl}/attendees` };

                if (normalizedResource === 'meeting') return { url: `${baseUrl}/dashboard?meetingId=${id}` };
                if (normalizedResource === 'attendee') return { url: `${baseUrl}/attendees?attendeeId=${id}` };
            }

            return { error: 'Invalid resource or action.' };
        }
    }),
});
