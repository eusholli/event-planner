import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { name, company } = body

        if (!name || !company) {
            return NextResponse.json({ error: 'Name and Company are required' }, { status: 400 })
        }

        const settings = await prisma.eventSettings.findFirst()
        if (!settings?.geminiApiKey) {
            return NextResponse.json({ error: 'Gemini API Key not configured' }, { status: 400 })
        }

        const genAI = new GoogleGenerativeAI(settings.geminiApiKey)
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-pro'
        })

        const prompt = `
        I have an attendee named "${name}" who works at "${company}".
        Please generate a likely professional profile for them with the following fields:
        - Title (Job Title)
        - Bio (Short professional biography, max 3 sentences)
        - LinkedIn URL (Best guess or placeholder if unknown)
        - Company Description (Short description of what ${company} does)

        Return ONLY a JSON object with keys: title, bio, linkedin, companyDescription.
        Do not include markdown formatting or backticks.
        `

        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        // Clean up potential markdown code blocks if Gemini adds them
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim()

        const data = JSON.parse(cleanText)

        return NextResponse.json(data)
    } catch (error: any) {
        console.error('Gemini API Error:', error)
        return NextResponse.json({
            error: 'Failed to generate suggestions',
            details: error.message || String(error)
        }, { status: 500 })
    }
}
