import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '@/lib/prisma';
import { currentUser } from '@clerk/nextjs/server';

interface AIContext {
    functionName: string;
}

export async function generateContentWithLog(
    modelName: string,
    prompt: string,
    context: AIContext,
    options?: { tools?: any }
) {
    // 1. Fetch API key
    const settings = await prisma.systemSettings.findFirst();
    if (!settings?.geminiApiKey) {
        throw new Error('Gemini API key not configured in System Settings');
    }

    // 2. Obtain current user's email gracefully mapped from Clerk
    const user = await currentUser();
    const userEmail = user?.emailAddresses?.[0]?.emailAddress || 'system-or-unknown@domain.com';

    // 3. Initialize Model
    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    const modelParams: Record<string, any> = { model: modelName };
    if (options && options.tools) modelParams.tools = options.tools;
    const generativeModel = genAI.getGenerativeModel(modelParams as any);

    // 4. Generate Content
    const result = await generativeModel.generateContent(prompt);

    // 5. Fire-and-forget log storage
    await prisma.aILog.create({
        data: {
            userEmail,
            functionName: context.functionName,
            prompt,
            modelUsed: modelName,
        }
    }).catch(console.error);

    return result;
}
