import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import prisma from '@/lib/prisma';
import * as tools from '@/lib/tools';

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

INTELLIGENT SEARCH & RESOLUTION:
- **Search First**: When a user provides a name, title, company, or other keyword, prefer using the \`search\` parameter available in tools like \`getMeetings\`, \`getAttendees\`, and \`getRooms\`. This handles partial matches across multiple fields.
- **Autonomous Resolution**: If a tool requires a specific ID or exact key (e.g., \`roomId\`, \`attendeeEmail\`, \`attendeeId\`) but the user has only provided a name or description (e.g., "Mickey's room", "Udai"), you MUST FIRST lookup the entity using the appropriate \`get...\` tool to find the correct ID/Key. Do NOT ask the user for IDs or Emails if you can find them yourself.
- **Ambiguity**: Only ask the user for clarification if a search returns multiple viable candidates (e.g., multiple "Johns" or "Project X" meetings).
`;

        const result = await streamText({
            model: google('gemini-2.5-pro'),
            system: systemPrompt,
            messages,
            onError: (error) => {
                console.error('Chat API Stream Error:', error);
            },
            tools: tools,
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
