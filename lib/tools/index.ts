import { createMeetingTools } from './meetings';
import { createAttendeeTools } from './attendees';
import { createRoomTools } from './rooms';
import { createNavigationTools } from './navigation';
import { createContentTools } from './content';

export const createTools = (eventId: string, eventSlug: string) => {
    return {
        ...createMeetingTools(eventId),
        ...createAttendeeTools(eventId),
        ...createRoomTools(eventId),
        ...createNavigationTools(eventId, eventSlug),
        ...createContentTools(eventId),
    };
};
