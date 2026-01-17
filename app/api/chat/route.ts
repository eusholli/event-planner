import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, convertToCoreMessages, stepCountIs } from 'ai';
import prisma from '@/lib/prisma';
import * as tools from '@/lib/tools';

// Allow streaming responses up to 300 seconds
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();

        // Convert UI messages to CoreMessages for the AI SDK
        const coreMessages = convertToCoreMessages(messages);
        // 1. Fetch API Key from EventSettings
        // 1. Fetch API Key from SystemSettings
        const settings = await prisma.systemSettings.findFirst();
        if (!settings?.geminiApiKey) {
            console.error('Chat API: Missing API Key');
            return new Response('Gemini API Key not configured in System Settings.', { status: 500 });
        }

        const google = createGoogleGenerativeAI({
            apiKey: settings.geminiApiKey,
        });

        // Construct System Prompt
        const systemPrompt = `
You are the AI assistant for the Event Planner application.
Current Date: ${new Date().toISOString().split('T')[0]}

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
- **Navigation Tools & Hybrid Support**:
    - **Proactive Links**: You are encouraged to provide UI navigation links (via \`getNavigationLinks\`) as a helpful convenience, even when offering to perform the action yourself.
    - **Hybrid Approach**: 
        - If the user intent is to **Create/Update** but details are missing (e.g. "I want to create a meeting"), you should: 
            1. Offer to help and ask for the missing details.
            2. *AND* proactively provide the link by calling the getNavigationLinks tool. Call this tool unconditionally for any "create" or "update" intent, even if details are missing.
        - If the user provides FULL details: Perform the action directly using the appropriate tool. You do not need to provide a "how-to" link in this case, but you should link to the *result* if possible (e.g. "Meeting created! View it here: [link]").
    - **How-To Requests**: If the user explicitly asks "how to" or "where can I", prioritize providing the navigation link immediately.
    - **Presentation**: When you use 'getNavigationLinks', do **NOT** output the raw URL in your text response (e.g. do not say "here is the link: /new-meeting"). The UI will automatically render a specialized card for the user. Simply state that you have provided a link below.
`;

        const result = await streamText({
            model: google('gemini-2.5-pro'),
            system: systemPrompt,
            messages: coreMessages,
            tools: tools,
            // Use stopWhen with stepCountIs to enable multi-step execution (replacing maxSteps)
            stopWhen: stepCountIs(5),
            onError: (error) => {
                console.error('Chat API Stream Error:', error);
            },


        });

        return result.toUIMessageStreamResponse();
    } catch (error: any) {
        console.error('Chat API Error:', error);
        return new Response(`Chat API Error: ${error.message || error}`, { status: 500 });
    }
}
