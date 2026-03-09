// lib/intelligence-email.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from '@/lib/prisma'

export type TargetUpdate = {
  type: 'company' | 'attendee'
  name: string
  summary: string
  salesAngle: string
  fullReport: string
}

export type UpcomingEvent = {
  name: string
  startDate: string | null
  endDate: string | null
  status: string
}

export async function composeIntelligenceEmail(
  recipientName: string,
  recipientEmail: string,
  unsubscribeToken: string,
  matchedTargets: TargetUpdate[],
  upcomingEvents: UpcomingEvent[]
): Promise<{ subject: string; html: string }> {
  const settings = await prisma.systemSettings.findFirst()
  if (!settings?.geminiApiKey) {
    throw new Error('Gemini API key not configured in system settings')
  }

  const genAI = new GoogleGenerativeAI(settings.geminiApiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' })

  const targetsText = matchedTargets
    .map(
      (t) =>
        `## ${t.name} (${t.type})\nSummary: ${t.summary}\nSales Angle: ${t.salesAngle}\n\nFull Report:\n${t.fullReport}`
    )
    .join('\n\n---\n\n')

  const eventsText = upcomingEvents
    .map((e) => `- ${e.name}: ${e.startDate ?? 'TBD'} to ${e.endDate ?? 'TBD'} (${e.status})`)
    .join('\n')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const prompt = `You are composing a market intelligence briefing email for an internal Rakuten Symphony sales/marketing team member.

Recipient: ${recipientName} (${recipientEmail})

Their relevant contacts and companies have the following intelligence updates:

${targetsText}

Upcoming events in the next 30 days:
${eventsText || 'No upcoming events.'}

Write a concise, professional HTML email. Rules:
1. First line: "Subject: <your subject line here>" (on its own line)
2. Then a blank line
3. Then the full HTML body starting with <html>
4. Structure: personalised opening sentence, then one <h3> per updated target with 2-3 bullet points of key updates and a "Sales Angle:" callout in a <blockquote>, then an upcoming events <table>, then an unsubscribe footer with this link: ${appUrl}/api/intelligence/unsubscribe?token=${unsubscribeToken}
5. Tone: sharp, B2B sales, no fluff. Max 600 words.
6. Do NOT wrap the HTML in markdown code fences.`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  // Parse subject line from first line
  const lines = text.split('\n')
  const subjectLine = lines[0].startsWith('Subject:') ? lines[0].slice(8).trim() : 'Your Market Intelligence Briefing'
  const htmlBody = lines.slice(1).join('\n').trim()

  return { subject: subjectLine, html: htmlBody }
}
