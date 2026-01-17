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

        // 1. Seed System Settings
        if (config.event) {
            const existingSettings = await prisma.systemSettings.findFirst()
            if (!existingSettings) {
                await prisma.systemSettings.create({
                    data: {
                        geminiApiKey: config.event.geminiApiKey,
                    },
                })
                console.log('Seeded System Settings')
            } else {
                console.log('System Settings already exist, skipping.')
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
