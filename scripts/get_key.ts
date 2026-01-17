
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.systemSettings.findFirst();
    const apiKey = settings?.geminiApiKey || process.env.GEMINI_API_KEY;
    console.log(apiKey || '');
    await prisma.$disconnect();
}

main();
