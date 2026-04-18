import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuth, type AuthContext } from '@/lib/with-auth';
import { generatePlaceholderEmail } from '@/lib/attendee-utils';

// Utility to resolve or create a company to get a valid companyId
async function resolveCompanyId(companyName: string | null | undefined): Promise<string | null> {
    if (!companyName) return null;
    const existing = await prisma.company.findFirst({
        where: { name: { equals: companyName, mode: 'insensitive' } }
    });
    if (existing) return existing.id;
    const newComp = await prisma.company.create({ data: { name: companyName } });
    return newComp.id;
}

export const dynamic = 'force-dynamic';

async function handlePOST(req: Request, ctx: { authCtx: AuthContext, params: Promise<Record<string, string>> }) {
    try {
        const { id: eventIdOrSlug } = await ctx.params;
        const event = await prisma.event.findFirst({
            where: { OR: [{ id: eventIdOrSlug }, { slug: eventIdOrSlug }] }
        });
        if (!event) {
            return NextResponse.json({ error: 'Event not found' }, { status: 404 });
        }
        const eventId = event.id;
        const { companies, people, meetings, addToRoiTargets } = await req.json();

        // Server-Side Mandatory Check
        if (companies && Array.isArray(companies)) {
            for (const c of companies) {
                if (!c.name) throw new Error("Company Name is required.");
            }
        }
        if (people && Array.isArray(people)) {
            for (const p of people) {
                if (!p.name || !p.companyName || !p.title) {
                    throw new Error(`Person ${p.name} is missing required fields (name, companyName, title).`);
                }
            }
        }
        if (meetings && Array.isArray(meetings)) {
            for (const m of meetings) {
                if (!m.title) throw new Error(`Meeting missing required title.`);
            }
        }

        const results = {
            companiesCreated: 0, companiesUpdated: 0,
            peopleCreated: 0, peopleUpdated: 0,
            meetingsCreated: 0, meetingsUpdated: 0
        };

        // 1. Save Companies (system-level, no event link needed)
        const companyIdMap = new Map<string, string>();
        if (companies && Array.isArray(companies)) {
            for (const comp of companies) {
                const { _id, existingRecord, aiSuggestedFields, id, createdAt, updatedAt, attendees, targetedByROI, intelligenceSubs, ...compData } = comp;
                const existing = await prisma.company.findFirst({
                    where: { name: { equals: compData.name, mode: 'insensitive' } }
                });

                if (existing) {
                    await prisma.company.update({
                        where: { id: existing.id },
                        data: compData
                    });
                    companyIdMap.set(compData.name?.toLowerCase(), existing.id);
                    results.companiesUpdated++;
                } else {
                    const fresh = await prisma.company.create({ data: compData });
                    companyIdMap.set(fresh.name.toLowerCase(), fresh.id);
                    results.companiesCreated++;
                }
            }
        }

        // 2. Save People (Attendees), linking to this event
        const personEmailToIdMap = new Map<string, string>();
        if (people && Array.isArray(people)) {
            for (const person of people) {
                const { _id, existingRecord, aiSuggestedFields, companyName, isExternal, id, createdAt, updatedAt, company, events, meetings, intelligenceSubs, ...personData } = person;

                // Get or create resolved companyId
                let resolvedCompanyId = companyName ? companyIdMap.get(companyName.toLowerCase()) : null;
                if (!resolvedCompanyId && companyName) {
                    resolvedCompanyId = await resolveCompanyId(companyName);
                }

                if (!resolvedCompanyId) {
                    throw new Error(`Could not resolve company for ${person.name}`);
                }

                // Resolve email: generate placeholder if not provided
                const rawEmail = (personData.email || '').trim()
                const personEmail = rawEmail || generatePlaceholderEmail()
                const personEmailMissing = !rawEmail

                const dataPayload = {
                    ...personData,
                    email: personEmail,
                    emailMissing: personEmailMissing,
                    companyId: resolvedCompanyId,
                    isExternal: isExternal ?? false
                };

                const existing = personEmailMissing ? null : await prisma.attendee.findUnique({
                    where: { email: personEmail }
                });

                if (existing) {
                    await prisma.attendee.update({
                        where: { id: existing.id },
                        data: {
                            ...dataPayload,
                            events: { connect: { id: eventId } }
                        }
                    });
                    personEmailToIdMap.set(personEmail, existing.id);
                    results.peopleUpdated++;
                } else {
                    const fresh = await prisma.attendee.create({
                        data: {
                            ...dataPayload,
                            events: { connect: { id: eventId } }
                        }
                    });
                    personEmailToIdMap.set(personEmail, fresh.id);
                    results.peopleCreated++;
                }
            }
        }

        // 3. Save Meetings, scoped to this event
        if (meetings && Array.isArray(meetings)) {
            for (const meet of meetings) {
                const { _id, existingRecord, aiSuggestedFields, attendeeEmails, id, createdAt, updatedAt, event, room, attendees, ...meetData } = meet;

                // Resolve Attendee connects
                let attendeeConnects: { id: string }[] = [];
                if (attendeeEmails && Array.isArray(attendeeEmails)) {
                    for (const email of attendeeEmails) {
                        const cleanEmail = String(email).trim().toLowerCase();
                        let attId = personEmailToIdMap.get(cleanEmail) || personEmailToIdMap.get(email);
                        if (!attId) {
                            const dbAtt = await prisma.attendee.findUnique({ where: { email: cleanEmail } });
                            if (dbAtt) {
                                attId = dbAtt.id;
                            } else {
                                // Auto-create missing attendee based on email
                                const parts = cleanEmail.split('@');
                                const namePart = parts[0] || 'Unknown';
                                const domainPart = parts[1] || 'unknown.com';

                                // Parse Name from local part (e.g., john.doe -> John Doe)
                                const parsedName = namePart.split(/[\.\-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');

                                // Parse CompanyName from domain (e.g., apple.com -> Apple)
                                const domainPieces = domainPart.split('.');
                                const companyNameRaw = domainPieces[0] ? domainPieces[0].charAt(0).toUpperCase() + domainPieces[0].slice(1) : 'Unknown';

                                const resolvedCompanyId = await resolveCompanyId(companyNameRaw);

                                if (resolvedCompanyId) {
                                    const freshAtt = await prisma.attendee.create({
                                        data: {
                                            name: parsedName || 'Unknown',
                                            email: cleanEmail,
                                            companyId: resolvedCompanyId,
                                            title: 'Unknown',
                                            isExternal: true,
                                            events: { connect: { id: eventId } }
                                        }
                                    });
                                    attId = freshAtt.id;
                                    personEmailToIdMap.set(cleanEmail, freshAtt.id);
                                    personEmailToIdMap.set(email, freshAtt.id);
                                    results.peopleCreated++;
                                }
                            }
                        }
                        if (attId) attendeeConnects.push({ id: attId });
                    }
                }

                let existing = null;
                if (meetData.title && meetData.date) {
                    existing = await prisma.meeting.findFirst({
                        where: { title: meetData.title, date: meetData.date, eventId }
                    });
                }

                if (existing) {
                    await prisma.meeting.update({
                        where: { id: existing.id },
                        data: {
                            ...meetData,
                            eventId,
                            attendees: attendeeConnects.length > 0 ? { set: attendeeConnects } : undefined
                        }
                    });
                    results.meetingsUpdated++;
                } else {
                    await prisma.meeting.create({
                        data: {
                            ...meetData,
                            eventId,
                            attendees: attendeeConnects.length > 0 ? { connect: attendeeConnects } : undefined
                        }
                    });
                    results.meetingsCreated++;
                }
            }
        }

        const companyIds: string[] = Array.from(companyIdMap.values());

        // When called from ROI page, add the saved companies to the event's ROI targets
        // Explicitly merge with existing IDs so we never overwrite what's already there
        if (addToRoiTargets && companyIds.length > 0) {
            const existing = await prisma.eventROITargets.findUnique({
                where: { eventId },
                select: { targetCompanies: { select: { id: true } } },
            });
            const existingIds = (existing?.targetCompanies ?? []).map((c: { id: string }) => c.id);
            const allIds = [...new Set([...existingIds, ...companyIds])];
            await prisma.eventROITargets.upsert({
                where: { eventId },
                create: {
                    event: { connect: { id: eventId } },
                    targetCompanies: { connect: allIds.map(id => ({ id })) },
                },
                update: {
                    targetCompanies: { set: allIds.map(id => ({ id })) },
                },
            });
        }

        return NextResponse.json({ success: true, results, companyIds });

    } catch (e: any) {
        console.error("Data ingestion save failed:", e);
        return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
    }
}

// Authorized for 'write' which maps to Root, Marketing, and Admin
export const POST = withAuth(handlePOST, { requireRole: 'write' }) as any;
