// lib/intelligence-email.ts
import { generateContentWithLog } from '@/lib/gemini'
import type { TargetUpdate } from '@/lib/intelligence-schema'

export type { TargetUpdate } from '@/lib/intelligence-schema'

export type UpcomingEvent = {
  name: string
  startDate: string | null
  endDate: string | null
  status: string
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
  upcomingEvents: UpcomingEvent[],
  appUrl?: string,
  reportToken?: string
): Promise<{ subject: string; html: string }> {

  const baseUrl = appUrl ?? process.env.CRON_EVENT_PLANNER_DNS ?? 'http://localhost:3000'

  const highlighted = matchedTargets.filter(t => t.highlighted)
  const eventLinked = matchedTargets.filter(t => !t.highlighted && t.linkedEventName)
  const other = matchedTargets.filter(t => !t.highlighted && !t.linkedEventName)

  const formatTarget = (t: TargetUpdate) => {
    const reportUrl = reportToken
      ? `${baseUrl}/intelligence/report/${encodeURIComponent(t.name)}?token=${reportToken}`
      : null
    const actionBlock = t.recommendedAction
      ? `Recommended Action: ${t.recommendedAction}`
      : ''
    const askMoreQuery =
      t.type === 'event'
        ? `Show me the latest market intelligence for event ${t.name}`
        : `Show me the latest market intelligence for ${t.name}`
    const askMoreUrl = `${baseUrl}/intelligence?autoQuery=${encodeURIComponent(askMoreQuery)}`
    const askMoreLink = `<a href="${askMoreUrl}" style="font-size:12px;color:#4a9eff;display:block;margin:4px 0;">Ask more questions... →</a>`
    const reportLinkHtml = reportUrl
      ? `<a href="${reportUrl}" style="font-size:12px;color:#666;display:block;margin:4px 0;">Read full brief →</a>`
      : ''
    const linksHtml = [askMoreLink, reportLinkHtml].filter(Boolean).join('\n')
    return `### ${t.name} (${t.type})\nSummary: ${t.summary}\nSales Angle: ${t.salesAngle}\n${actionBlock}\nLINKS_HTML_VERBATIM:\n${linksHtml}\nEND_LINKS_HTML\n\nFull Report:\n${t.fullReport}`
  }

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
   - If a target has a "Recommended Action": render it as a styled callout div immediately after the Sales Angle blockquote:
     <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:8px 12px;margin:8px 0;font-size:13px;"><strong>Recommended Action:</strong> [action text here]</div>
   - If a target has a LINKS_HTML_VERBATIM block: copy the exact HTML between LINKS_HTML_VERBATIM: and END_LINKS_HTML verbatim into the email immediately after the Recommended Action div (or after the Sales Angle blockquote if no action). Do NOT modify the href values or any attributes.
   - Upcoming events as a <table> (columns: Event, Dates, Status)
   - Unsubscribe footer with link: ${baseUrl}/api/intelligence/unsubscribe?token=${unsubscribeToken}
5. Tone: sharp, B2B sales, no fluff. Max 800 words.
6. Do NOT wrap the HTML in markdown code fences.`

  const result = await generateContentWithLog(
    'gemini-3.1-flash-lite-preview',
    prompt,
    { functionName: 'IntelligenceEmail-ComposeRecipient' }
  )
  return parseGeminiResponse(result.response.text())
}

export async function composeAggregateEmail(
  recipientName: string,
  allTargets: TargetUpdate[],
  upcomingEvents: UpcomingEvent[],
  runDate: string,
  appUrl?: string,
  reportToken?: string
): Promise<{ subject: string; html: string }> {

  const baseUrl = appUrl ?? process.env.CRON_EVENT_PLANNER_DNS ?? 'http://localhost:3000'

  const byType = {
    company: allTargets.filter(t => t.type === 'company'),
    attendee: allTargets.filter(t => t.type === 'attendee'),
    event: allTargets.filter(t => t.type === 'event'),
  }

  const formatTarget = (t: TargetUpdate) => {
    const reportUrl = reportToken
      ? `${baseUrl}/intelligence/report/${encodeURIComponent(t.name)}?token=${reportToken}`
      : null
    const actionBlock = t.recommendedAction
      ? `Recommended Action: ${t.recommendedAction}`
      : ''
    const askMoreQuery =
      t.type === 'event'
        ? `Show me the latest market intelligence for event ${t.name}`
        : `Show me the latest market intelligence for ${t.name}`
    const askMoreUrl = `${baseUrl}/intelligence?autoQuery=${encodeURIComponent(askMoreQuery)}`
    const askMoreLink = `<a href="${askMoreUrl}" style="font-size:12px;color:#4a9eff;display:block;margin:4px 0;">Ask more questions... →</a>`
    const reportLinkHtml = reportUrl
      ? `<a href="${reportUrl}" style="font-size:12px;color:#666;display:block;margin:4px 0;">Read full brief →</a>`
      : ''
    const linksHtml = [askMoreLink, reportLinkHtml].filter(Boolean).join('\n')
    return `### ${t.name}\nSummary: ${t.summary}\nSales Angle: ${t.salesAngle}\n${actionBlock}\nLINKS_HTML_VERBATIM:\n${linksHtml}\nEND_LINKS_HTML\n\nFull Report:\n${t.fullReport}`
  }

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
   - If a target has a "Recommended Action": render it as a styled callout div immediately after the Sales Angle blockquote:
     <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:8px 12px;margin:8px 0;font-size:13px;"><strong>Recommended Action:</strong> [action text here]</div>
   - If a target has a LINKS_HTML_VERBATIM block: copy the exact HTML between LINKS_HTML_VERBATIM: and END_LINKS_HTML verbatim into the email immediately after the Recommended Action div (or after the Sales Angle blockquote if no action). Do NOT modify the href values or any attributes.
   - Upcoming events <table>
   - No unsubscribe link (this is a system report)
5. Tone: sharp, B2B, executive summary. Max 1200 words.
6. Do NOT wrap the HTML in markdown code fences.`

  const result = await generateContentWithLog(
    'gemini-3.1-flash-lite-preview',
    prompt,
    { functionName: 'IntelligenceEmail-ComposeAggregate' }
  )
  return parseGeminiResponse(result.response.text())
}
