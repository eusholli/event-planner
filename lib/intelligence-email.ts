// lib/intelligence-email.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '@/lib/prisma'

export type TargetUpdate = {
  type: 'company' | 'attendee' | 'event'
  name: string
  summary: string
  salesAngle: string
  fullReport: string
  highlighted?: boolean   // true = user directly selected this entity
  linkedEventName?: string // set when this target came from a subscribed event
}

export type UpcomingEvent = {
  name: string
  startDate: string | null
  endDate: string | null
  status: string
}

async function getGeminiModel() {
  const settings = await prisma.systemSettings.findFirst()
  if (!settings?.geminiApiKey) {
    throw new Error('Gemini API key not configured in system settings')
  }
  const genAI = new GoogleGenerativeAI(settings.geminiApiKey)
  return genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite-preview' })
}

function parseGeminiResponse(text: string): { subject: string; html: string } {
  const lines = text.trim().split('\n')
  const subjectLine = lines[0].startsWith('Subject:') ? lines[0].slice(8).trim() : 'Your Market Intelligence Briefing'
  const htmlBody = lines.slice(1).join('\n').trim()
  return { subject: subjectLine, html: htmlBody }
}

export async function composeIntelligenceEmail(
  recipientName: string,
  recipientEmail: string,
  unsubscribeToken: string,
  matchedTargets: TargetUpdate[],
  upcomingEvents: UpcomingEvent[]
): Promise<{ subject: string; html: string }> {
  const model = await getGeminiModel()

  const highlighted = matchedTargets.filter(t => t.highlighted)
  const eventLinked = matchedTargets.filter(t => !t.highlighted && t.linkedEventName)
  const other = matchedTargets.filter(t => !t.highlighted && !t.linkedEventName)

  const formatTarget = (t: TargetUpdate) =>
    `### ${t.name} (${t.type})\nSummary: ${t.summary}\nSales Angle: ${t.salesAngle}\n\nFull Report:\n${t.fullReport}`

  const highlightedText = highlighted.length
    ? `## ⭐ YOUR DIRECTLY TRACKED TARGETS\n${highlighted.map(formatTarget).join('\n\n---\n\n')}`
    : ''

  const eventLinkedText = eventLinked.length
    ? `## FROM YOUR TRACKED EVENTS\n${eventLinked.map(t => `[${t.linkedEventName}]\n${formatTarget(t)}`).join('\n\n---\n\n')}`
    : ''

  const otherText = other.length
    ? `## OTHER TRACKED TARGETS\n${other.map(formatTarget).join('\n\n---\n\n')}`
    : ''

  const targetsText = [highlightedText, eventLinkedText, otherText].filter(Boolean).join('\n\n')

  const eventsText = upcomingEvents
    .map(e => `- ${e.name}: ${e.startDate ?? 'TBD'} to ${e.endDate ?? 'TBD'} (${e.status})`)
    .join('\n')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const prompt = `You are composing a market intelligence briefing email for an internal Rakuten Symphony sales/marketing team member.

Recipient: ${recipientName} (${recipientEmail})

Intelligence updates for their tracked targets:

${targetsText}

Upcoming events in the next 30 days:
${eventsText || 'No upcoming events.'}

Write a concise, professional HTML email. Rules:
1. First line: "Subject: <your subject line here>" (on its own line)
2. Then a blank line
3. Then the full HTML body starting with <html>
4. Structure:
   - Personalised opening sentence referencing their specific tracked items
   - If there are ⭐ DIRECTLY TRACKED TARGETS: render them first with a bold "⭐ You're tracking this" callout per item
   - If there are FROM YOUR TRACKED EVENTS targets: group them by event name with an <h3> event header
   - Per target: <h3> heading, 2-3 bullet points of key updates, a "Sales Angle:" callout in a <blockquote>
   - Upcoming events as a <table> (columns: Event, Dates, Status)
   - Unsubscribe footer with link: ${appUrl}/api/intelligence/unsubscribe?token=${unsubscribeToken}
5. Tone: sharp, B2B sales, no fluff. Max 800 words.
6. Do NOT wrap the HTML in markdown code fences.`

  const result = await model.generateContent(prompt)
  return parseGeminiResponse(result.response.text())
}

export async function composeAggregateEmail(
  recipientName: string,
  allTargets: TargetUpdate[],
  upcomingEvents: UpcomingEvent[],
  runDate: string
): Promise<{ subject: string; html: string }> {
  const model = await getGeminiModel()

  const byType = {
    company: allTargets.filter(t => t.type === 'company'),
    attendee: allTargets.filter(t => t.type === 'attendee'),
    event: allTargets.filter(t => t.type === 'event'),
  }

  const formatTarget = (t: TargetUpdate) =>
    `### ${t.name}\nSummary: ${t.summary}\nSales Angle: ${t.salesAngle}\n\nFull Report:\n${t.fullReport}`

  const targetsText = [
    byType.company.length ? `## Companies\n${byType.company.map(formatTarget).join('\n\n---\n\n')}` : '',
    byType.attendee.length ? `## Attendees\n${byType.attendee.map(formatTarget).join('\n\n---\n\n')}` : '',
    byType.event.length ? `## Events\n${byType.event.map(formatTarget).join('\n\n---\n\n')}` : '',
  ].filter(Boolean).join('\n\n')

  const eventsText = upcomingEvents
    .map(e => `- ${e.name}: ${e.startDate ?? 'TBD'} to ${e.endDate ?? 'TBD'} (${e.status})`)
    .join('\n')

  const prompt = `You are composing a full market intelligence aggregate report for ${recipientName}, a senior Rakuten Symphony team member with full system access.

Run date: ${runDate}
Total updated targets: ${allTargets.length}

All intelligence updates this run:

${targetsText}

Upcoming events in the next 30 days:
${eventsText || 'No upcoming events.'}

Write a concise, professional HTML email. Rules:
1. First line: "Subject: Intelligence Briefing – All Targets – ${runDate}" (exactly as written)
2. Then a blank line
3. Then the full HTML body starting with <html>
4. Structure:
   - Opening: "Full market intelligence run for ${runDate}. ${allTargets.length} targets updated."
   - Companies section (if any): <h2> heading, then per-company <h3> with 2-3 bullets + Sales Angle <blockquote>
   - Attendees section (if any): same pattern
   - Events section (if any): same pattern
   - Upcoming events <table>
   - No unsubscribe link (this is a system report)
5. Tone: sharp, B2B, executive summary. Max 1200 words.
6. Do NOT wrap the HTML in markdown code fences.`

  const result = await model.generateContent(prompt)
  return parseGeminiResponse(result.response.text())
}
