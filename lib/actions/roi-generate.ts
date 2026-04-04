'use server'

import { generateContentWithLog } from '@/lib/gemini'
import prisma from '@/lib/prisma'

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface ROIDraft {
    budget: number | null
    expectedPipeline: number | null
    winRate: number | null           // decimal e.g. 0.15 for 15%
    targetCustomerMeetings: number | null
    targetErta: number | null        // decimal percentage e.g. 15 for 15%
    targetSpeaking: number | null
    targetMediaPR: number | null
    targetCompanies: Array<{ name: string; description: string }>
    // requesterEmail intentionally excluded — AI should not guess an email address
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function buildEventContext(event: {
    name: string
    startDate: Date | null
    endDate: Date | null
    timezone: string | null
    region: string | null
    address: string | null
    url: string | null
    boothLocation: string | null
    description: string | null
    tags: string[]
    targetCustomers: string | null
    budget: number | null
}): string {
    const lines: string[] = ['## Event Details', '']

    const add = (label: string, value: string | null | undefined) => {
        if (value != null && value !== '') lines.push(`- **${label}:** ${value}`)
    }

    add('Name', event.name)

    if (event.startDate || event.endDate) {
        const start = event.startDate ? event.startDate.toISOString().split('T')[0] : 'TBD'
        const end = event.endDate ? event.endDate.toISOString().split('T')[0] : 'TBD'
        const tz = event.timezone ? ` (${event.timezone})` : ''
        lines.push(`- **Dates:** ${start} – ${end}${tz}`)
    }

    add('Region', event.region)
    add('Location', event.address)
    add('Website', event.url)
    add('Booth', event.boothLocation)
    add('Description', event.description)

    if (event.tags && event.tags.length > 0) {
        lines.push(`- **Themes/Tags:** ${event.tags.join(', ')}`)
    }

    add('Target Customers', event.targetCustomers)

    if (event.budget) {
        lines.push(`- **Budget:** $${event.budget.toLocaleString()}`)
    }

    return lines.join('\n')
}

// -----------------------------------------------------------------------
// Phase 1: Generate marketing plan (Gemini + web search)
// -----------------------------------------------------------------------

export async function generateMarketingPlan(eventId: string): Promise<string> {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    const [event, settings] = await Promise.all([
        prisma.event.findUnique({
            where: { id: eventId },
            select: {
                name: true, startDate: true, endDate: true, timezone: true,
                region: true, address: true, url: true, boothLocation: true,
                description: true, tags: true, targetCustomers: true, budget: true,
            }
        }),
        prisma.systemSettings.findFirst(),
    ])

    if (!event) throw new Error('Event not found')

    // Removed direct initialization, moved to gemini helper

    // TODO: pull company name from SystemSettings once that field is added
    const companyName = 'Rakuten Symphony'

    const context = buildEventContext(event)

    const prompt = `You are a B2B event marketing strategist helping ${companyName} plan their attendance at the following event. Use Google Search to find the latest publicly available information about this event.

${context}

Please produce a comprehensive marketing plan with the following clearly labelled sections using ## headings:

## 30-Day Pre-Event Marketing Plan
A week-by-week timeline of concrete marketing actions starting 30 days before the event (outreach, content, social, internal prep, logistics, meeting scheduling, etc.).

## 15-Day Post-Event Follow-Up Plan
A day-by-day or week-by-week timeline of follow-up actions for 15 days after the event ends (lead follow-up, content publishing, pipeline updates, internal debrief, etc.).

## Target Companies
List the 10–15 companies most likely to attend this event and most valuable for ${companyName} to engage. For each company provide:
- **Name:** [company name]
- **Description:** [1–2 sentence description of the company: industry, focus area, size]
- **Reason to Engage:** [why they attend this event and why they are a priority for ${companyName}]

## Draft ROI Targets
Suggest realistic draft values for each of the following metrics, with a brief rationale for each:
- **Budget:** estimated total event attendance cost in USD
- **Expected Pipeline:** estimated total pipeline value in USD that could be generated
- **Win Rate:** estimated close rate as a decimal (e.g. 0.15 for 15%)
- **Target Customer Meetings:** target number of customer/prospect meetings
- **Target ERTA:** target Engagement Rate from Targeted Accounts as a percentage (e.g. 15 for 15%)
- **Target Speaking:** target number of speaking slots/panels to secure
- **Target Media/PR:** target number of media interviews or press mentions`

    const result = await generateContentWithLog(
        'gemini-3-flash-preview',
        prompt,
        { functionName: 'ROIGenerate-MarketingPlan' },
        { tools: [{ googleSearch: {} }] }
    )
    const planText = result.response.text()

    // Save to DB — upsert so this works whether or not an ROI record exists yet
    await prisma.eventROITargets.upsert({
        where: { eventId },
        create: { event: { connect: { id: eventId } }, marketingPlan: planText },
        update: { marketingPlan: planText },
    })

    return planText
}

// -----------------------------------------------------------------------
// Phase 2: Extract structured ROI values from existing marketing plan
// -----------------------------------------------------------------------

export async function extractROIValues(eventId: string): Promise<ROIDraft> {
    const { canWrite } = await import('@/lib/roles')
    if (!await canWrite()) throw new Error('Forbidden')

    const [roiRecord, settings] = await Promise.all([
        prisma.eventROITargets.findUnique({
            where: { eventId },
            select: { marketingPlan: true },
        }),
        prisma.systemSettings.findFirst(),
    ])

    const marketingPlan = roiRecord?.marketingPlan
    if (!marketingPlan) {
        throw new Error('No marketing plan found for this event. Generate one first.')
    }

    // Removed direct initialization, moved to gemini helper

    const prompt = `You are a data extraction assistant. Read the following event marketing plan and extract the specified values.

Return ONLY a valid JSON object — no markdown, no backticks, no explanation.

Marketing Plan:
---
${marketingPlan}
---

Extract these fields from the "Draft ROI Targets" section of the plan:
- budget (number in USD, integer, or null if not found)
- expectedPipeline (number in USD, integer, or null if not found)
- winRate (decimal number e.g. 0.15 for 15%, or null if not found)
- targetCustomerMeetings (integer, or null if not found)
- targetErta (number as percentage value e.g. 15 for 15%, or null if not found)
- targetSpeaking (integer, or null if not found)
- targetMediaPR (integer, or null if not found)

Extract these fields from the "Target Companies" section:
- targetCompanies: array of objects, each with:
  - name (string)
  - description (string — the 1-2 sentence company description)

JSON format:
{
  "budget": 50000,
  "expectedPipeline": 2000000,
  "winRate": 0.15,
  "targetCustomerMeetings": 20,
  "targetErta": 15,
  "targetSpeaking": 3,
  "targetMediaPR": 2,
  "targetCompanies": [
    { "name": "Acme Corp", "description": "Cloud infrastructure provider focused on enterprise customers." }
  ]
}`

    const result = await generateContentWithLog(
        'gemini-2.0-flash',
        prompt,
        { functionName: 'ROIGenerate-ExtractPhase' }
    )
    const text = result.response.text()

    // Robust JSON extraction — strip markdown if Gemini adds it
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim()

    // Find the JSON object boundaries
    const firstOpen = cleanText.indexOf('{')
    const lastClose = cleanText.lastIndexOf('}')
    const jsonStr = firstOpen !== -1 && lastClose !== -1
        ? cleanText.substring(firstOpen, lastClose + 1)
        : cleanText

    return JSON.parse(jsonStr) as ROIDraft
}
