// app/api/viber/link/create/route.ts
//
// Mints a one-time link code for a logged-in event-planner user, returning a
// viber:// deep link that opens the bot 1:1 with the code in the `context`
// param. The bot redeems the code via /api/viber/link/redeem on
// conversation_started.
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/with-auth'
import prisma from '@/lib/prisma'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

const LINK_CODE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// Crockford-style base32 (no I/L/O/U) to keep codes user-readable on QR scan
const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function generateLinkCode(length = 10): string {
    const bytes = randomBytes(length)
    let out = ''
    for (let i = 0; i < length; i++) {
        out += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length]
    }
    return out
}

export const POST = withAuth(async (_req, { authCtx }) => {
    const botUri = process.env.VIBER_BOT_URI
    if (!botUri) {
        return NextResponse.json({ error: 'VIBER_BOT_URI not configured' }, { status: 500 })
    }

    const code = generateLinkCode(10)
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS)

    await prisma.viberLinkCode.create({
        data: { code, clerkUserId: authCtx.userId, expiresAt },
    })

    const deepLink = `viber://pa?chatURI=${encodeURIComponent(botUri)}&context=${encodeURIComponent(code)}`

    return NextResponse.json({
        code,
        deepLink,
        expiresAt: expiresAt.toISOString(),
    })
})
