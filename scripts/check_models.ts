const { GoogleGenerativeAI } = require("@google/generative-ai");
const { PrismaClient } = require("@prisma/client");
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    const settings = await prisma.eventSettings.findFirst();
    if (!settings?.geminiApiKey) {
        console.log("No API Key found in settings");
        return;
    }

    const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Dummy model to get client
        // There isn't a direct listModels on the client instance in the node SDK easily accessible like this sometimes, 
        // but let's try the standard way if available or just use a known working one.
        // Actually, the SDK doesn't always expose listModels directly on the main class in all versions.
        // Let's try to just run a generation with gemini-1.5-flash to see if it works at all.
        console.log("Testing gemini-1.5-flash...");
        const result = await model.generateContent("Hello");
        console.log("gemini-1.5-flash works:", await result.response.text());
    } catch (e) {
        console.error("Error:", (e as any).message);
    }
}

main();
