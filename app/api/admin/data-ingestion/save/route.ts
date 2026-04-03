import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withAuth } from '@/lib/with-auth';

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

async function handlePOST(req: Request) {
    try {
        const { companies, people, meetings } = await req.json();

        // Server-Side Mandatory Check
        if (companies && Array.isArray(companies)) {
            for (const c of companies) {
                if (!c.name) throw new Error("Company Name is required.");
            }
        }
        if (people && Array.isArray(people)) {
            for (const p of people) {
                if (!p.name || !p.email || !p.companyName || !p.title) {
                    throw new Error(`Person ${p.name || p.email} is missing required fields (name, email, companyName, title).`);
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

        // 1. Save Companies
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

        // 2. Save People (Attendees)
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

                const dataPayload = {
                    ...personData,
                    companyId: resolvedCompanyId,
                    isExternal: isExternal ?? false
                };

                const existing = await prisma.attendee.findUnique({
                    where: { email: personData.email }
                });

                if (existing) {
                    await prisma.attendee.update({
                        where: { id: existing.id },
                        data: dataPayload
                    });
                    personEmailToIdMap.set(personData.email, existing.id);
                    results.peopleUpdated++;
                } else {
                    const fresh = await prisma.attendee.create({ data: dataPayload });
                    personEmailToIdMap.set(personData.email, fresh.id);
                    results.peopleCreated++;
                }
            }
        }

        // 3. Save Meetings
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
                                            isExternal: true
                                        }
                                    });
                                    attId = freshAtt.id;
                                    personEmailToIdMap.set(cleanEmail, freshAtt.id);
                                    personEmailToIdMap.set(email, freshAtt.id); // also cache original case
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
                        where: { title: meetData.title, date: meetData.date }
                    });
                }

                if (existing) {
                    await prisma.meeting.update({
                        where: { id: existing.id },
                        data: {
                            ...meetData,
                            attendees: attendeeConnects.length > 0 ? { set: attendeeConnects } : undefined
                        }
                    });
                    results.meetingsUpdated++;
                } else {
                    await prisma.meeting.create({
                        data: {
                            ...meetData,
                            attendees: attendeeConnects.length > 0 ? { connect: attendeeConnects } : undefined
                        }
                    });
                    results.meetingsCreated++;
                }
            }
        }

        return NextResponse.json({ success: true, results });

    } catch (e: any) {
        console.error("Data ingestion save failed:", e);
        return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
    }
}

export const POST = withAuth(handlePOST, { requireRole: 'manageEvents' }) as any;
