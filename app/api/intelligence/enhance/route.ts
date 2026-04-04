import { NextResponse } from 'next/server'
import { generateContentWithLog } from '@/lib/gemini';
import prisma from '@/lib/prisma'
import { withAuth } from '@/lib/with-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function postHandler(request: Request) {
    try {
        const body = await request.json()
        const { record, type, name, company } = body

        const targetType = type || 'people'
        const targetRecord = record || { name, companyName: company }

        if (!targetRecord || Object.keys(targetRecord).length === 0) {
            return NextResponse.json({ error: 'Record details missing' }, { status: 400 })
        }

        let fieldsToFind = ''
        switch (targetType) {
            case 'companies':
                fieldsToFind = 'description, pipelineValue (try to estimate it for B2B)'
                break
            case 'people':
            case 'attendees':
                fieldsToFind = 'title, bio (short), linkedin url, seniorityLevel'
                break
            case 'meetings':
                fieldsToFind = 'purpose, location'
                break
            default:
                fieldsToFind = 'any missing relevant context based on keys'
        }

        const prompt = `
        I have a record of type "${targetType}".
        Known Details: ${JSON.stringify(targetRecord)}
        
        Using your web search capabilities, please find and generate these missing professional details if possible:
        - ${fieldsToFind}
        
        Return ONLY a JSON object containing keys for the discovered fields. For example, if you find the bio, return { "bio": "..." }. 
        If you find nothing, return an empty JSON object {}.
        Do not include markdown formatting, backticks, or any explanation.
        `

        const result = await generateContentWithLog(
            'gemini-3.1-flash-lite-preview',
            prompt,
            { functionName: 'Intelligence-Enhance' },
            { tools: [{ googleSearch: {} }] }
        )
        const text = result.response.text()

        const firstOpen = text.indexOf('{')
        const lastClose = text.lastIndexOf('}')
        const jsonStr = firstOpen !== -1 && lastClose !== -1 
            ? text.substring(firstOpen, lastClose + 1) 
            : text

        const data = JSON.parse(jsonStr)

        return NextResponse.json(data)
    } catch (error: any) {
        console.error('Gemini API Error:', error)
        return NextResponse.json({
            error: 'Failed to generate enhancements',
            details: error.message || String(error)
        }, { status: 500 })
    }
}

export const POST = withAuth(postHandler, { requireAuth: true }) as any
