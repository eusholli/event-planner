
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listModels() {
    try {
        const settings = await prisma.eventSettings.findFirst();
        if (!settings?.geminiApiKey) {
            console.error('No Gemini API configured in EventSettings');
            process.exit(1);
        }

        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        // Fetch models directly via HTTP to debug
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${settings.geminiApiKey}`;
        console.log('Fetching models list...');
        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            console.error('API Error:', data);
        } else {
            console.log('Available Models:');
            if (data.models) {
                data.models.forEach((m: any) => console.log(`- ${m.name} (${m.supportedGenerationMethods})`));
            } else {
                console.log('No models returned', data);
            }
        }


    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

listModels();
