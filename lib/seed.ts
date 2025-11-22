import fs from 'fs'
import path from 'path'
import prisma from './prisma'

export async function seed() {
    try {
        const configPath = path.join(process.cwd(), 'event-config.json')
        if (!fs.existsSync(configPath)) {
            console.log('No event-config.json found, skipping seed.')
            return
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        console.log('Seeding database from event-config.json...')

        // 1. Seed Event Settings
        if (config.event) {
            const existingSettings = await prisma.eventSettings.findFirst()
            if (!existingSettings) {
                await prisma.eventSettings.create({
                    data: {
                        name: config.event.name,
                        startDate: new Date(config.event.startDate),
                        endDate: new Date(config.event.endDate),
                    },
                })
                console.log('Seeded Event Settings')
            } else {
                console.log('Event Settings already exist, skipping.')
            }
        }

        // 2. Seed Attendees
        if (config.attendees && Array.isArray(config.attendees)) {
            for (const attendee of config.attendees) {
                const existing = await prisma.attendee.findUnique({
                    where: { email: attendee.email },
                })
                if (!existing) {
                    await prisma.attendee.create({
                        data: attendee,
                    })
                    console.log(`Seeded Attendee: ${attendee.name}`)
                }
            }
        }

        // 3. Seed Rooms
        if (config.rooms && Array.isArray(config.rooms)) {
            for (const room of config.rooms) {
                const existing = await prisma.room.findFirst({
                    where: { name: room.name },
                })
                if (!existing) {
                    await prisma.room.create({
                        data: room,
                    })
                    console.log(`Seeded Room: ${room.name}`)
                }
            }
        }

        console.log('Seeding completed.')
    } catch (error) {
        console.error('Error during seeding:', error)
    }
}
