import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withAuth, type AuthContext } from '@/lib/with-auth';

// Shim for pdf-parse in Node.js
if (typeof global.DOMMatrix === 'undefined') {
    (global as any).DOMMatrix = class DOMMatrix {};
}
if (typeof global.Path2D === 'undefined') {
    (global as any).Path2D = class Path2D {};
}
const pdfParse = require('pdf-parse');
import * as xlsx from 'xlsx';

// Maximum execution time for extraction (in seconds)
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function extractTextFromBlob(blob: Blob, fileName: string): Promise<string> {
    const buffer = Buffer.from(await blob.arrayBuffer());
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.pdf')) {
        try {
            const data = await pdfParse(buffer);
            return data.text;
        } catch (e) {
            console.warn('PDF parsing failed, falling back to raw:', e);
            return buffer.toString('utf-8');
        }
    } else if (lowerName.endsWith('.docx')) {
        // dynamic import of mammoth to avoid issues on edge if any
        try {
            const mammoth = (await import('mammoth')).default;
            const result = await mammoth.extractRawText({ buffer });
            return result.value;
        } catch (e) {
            console.warn('DOCX parsing failed, falling back to raw:', e);
            return buffer.toString('utf-8');
        }
    } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv')) {
        try {
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            let text = '';
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                text += `\n--- Sheet: ${sheetName} ---\n`;
                text += xlsx.utils.sheet_to_csv(sheet) + '\n';
            }
            return text;
        } catch (e) {
            console.warn('Spreadsheet parsing failed, falling back to raw:', e);
            return buffer.toString('utf-8');
        }
    } else {
        // Assume TXT or raw textual data
        return buffer.toString('utf-8');
    }
}

async function handlePOST(req: Request, ctx: { authCtx: AuthContext }) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as Blob | null;
        let textData = formData.get('textData') as string | null;

        if (!file && !textData) {
            return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
        }

        if (file && (!textData || textData.trim() === '')) {
            const fileName = (file as any).name || 'unknown.txt';
            textData = await extractTextFromBlob(file, fileName);
        }

        const settings = await prisma.systemSettings.findFirst();
        if (!settings?.geminiApiKey) {
            return NextResponse.json({ error: 'Gemini API constraint unmet in system settings' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(settings.geminiApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

        const prompt = `
You are a data extraction assistant. Extract Companies, People, and Meetings strictly adhering to the schema.
You must find details from the following raw document text.

If you generate or assume a value that is NOT explicitly stated in the text (e.g., guessing a seniorityLevel or pipelineValue), you MUST append that exact field's key string to the "aiSuggestedFields" array for that specific object.

Return ONLY a valid JSON object - no markdown, no backticks, no explanation.

Schema requirements:
{
  "companies": [{ "name": "string", "description": "string", "pipelineValue": 0, "aiSuggestedFields": [] }],
  "people": [{ "name": "string", "email": "string", "title": "string", "bio": "string", "companyName": "string", "linkedin": "string", "imageUrl": "string", "type": "string", "seniorityLevel": "string", "aiSuggestedFields": [] }],
  "meetings": [{ "title": "string", "purpose": "string", "date": "YYYY-MM-DD", "startTime": "string", "endTime": "string", "sequence": 0, "status": "PIPELINE", "tags": [], "calendarInviteSent": false, "createdBy": "string", "isApproved": false, "meetingType": "string", "otherDetails": "string", "requesterEmail": "string", "location": "string", "attendeeEmails": [], "aiSuggestedFields": [] }]
}

Document Text:
======================================
${textData}
======================================
`;

        const result = await model.generateContent(prompt);
        const textResponse = result.response.text();
        const cleanText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const firstOpen = cleanText.indexOf('{');
        const lastClose = cleanText.lastIndexOf('}');
        const jsonStr = firstOpen !== -1 && lastClose !== -1 
            ? cleanText.substring(firstOpen, lastClose + 1) 
            : cleanText;
            
        const object = JSON.parse(jsonStr);

        // Helper to fill in blank AI extracted fields from Existing DB values
        const applyFill = (extracted: any, existing: any) => {
            if (!existing) return;
            Object.keys(existing).forEach(k => {
                if ((extracted[k] === null || extracted[k] === undefined || extracted[k] === '') &&
                    (existing[k] !== null && existing[k] !== undefined && existing[k] !== '')) {
                    extracted[k] = existing[k];
                }
            });
        };

        // Compute isExternal intelligently for people.
        const existingAttendees = await prisma.attendee.findMany({
            where: { isExternal: false },
            select: { email: true }
        });
        const internalDomains = new Set(
            existingAttendees
                .map(a => a.email.split('@')[1]?.toLowerCase())
                .filter(Boolean)
        );

        // Augment People Payload with isExternal Check & DB checks
        const augmentedPeople = await Promise.all(object.people.map(async (person: any) => {
            const emailDomain = person.email.split('@')[1]?.toLowerCase();
            const isExternalFlag = emailDomain && internalDomains.has(emailDomain) ? false : true;
            
            const existingMatch = await prisma.attendee.findUnique({ where: { email: person.email } });
            applyFill(person, existingMatch);
            
            return {
                ...person,
                isExternal: isExternalFlag,
                existingRecord: existingMatch ? existingMatch : null,
            };
        }));

        // Augment Company Payload with DB checks
        const augmentedCompanies = await Promise.all(object.companies.map(async (comp: any) => {
            const existingMatch = await prisma.company.findFirst({
                where: { name: { equals: comp.name, mode: 'insensitive' } }
            });
            applyFill(comp, existingMatch);
            
            return {
                ...comp,
                existingRecord: existingMatch ? existingMatch : null,
            };
        }));

        // Augment Meetings Payload with DB checks
        const augmentedMeetings = await Promise.all(object.meetings.map(async (meet: any) => {
            let existingMatch = null;
            if (meet.title && meet.date) {
                existingMatch = await prisma.meeting.findFirst({
                    where: { 
                        title: meet.title,
                        date: meet.date
                    }
                });
            } else if (meet.title && meet.startTime) {
                existingMatch = await prisma.meeting.findFirst({
                    where: { 
                        title: meet.title,
                        startTime: meet.startTime
                    }
                });
            }
            applyFill(meet, existingMatch);
            
            return {
                ...meet,
                existingRecord: existingMatch ? existingMatch : null,
            };
        }));

        return NextResponse.json({
            companies: augmentedCompanies,
            people: augmentedPeople,
            meetings: augmentedMeetings
        });
    } catch (e: any) {
        console.error("Data ingestion extraction failed:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// Authorized for 'manageEvents' which maps to Root and Marketing
export const POST = withAuth(handlePOST, { requireRole: 'manageEvents' }) as any;
