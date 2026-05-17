import { clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/with-auth'
import prisma from '@/lib/prisma'
import { sendPlainEmail } from '@/lib/email'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

const LINK_CODE_TTL_MS = 24 * 60 * 60 * 1000

const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function generateLinkCode(length = 10): string {
    const bytes = randomBytes(length)
    let out = ''
    for (let i = 0; i < length; i++) {
        out += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length]
    }
    return out
}

function buildInviteEmail({ name, botName, deepLink, qrUrl }: {
    name: string; botName: string; deepLink: string; qrUrl: string
}): string {
    return `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #222;">
  <h2 style="color: #1a1a2e;">You've been invited to ${botName}</h2>
  <p>Hi ${name},</p>
  <p>You've been granted access to the <strong>${botName} Intelligence Service</strong> on Viber.</p>
  <p>To activate your access, tap the button below on your phone or scan the QR code with your camera:</p>
  <p style="margin: 24px 0;">
    <a href="${deepLink}" style="background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
      Activate in Viber
    </a>
  </p>
  <p>Or scan this QR code with your phone camera:</p>
  <img src="${qrUrl}" alt="QR Code" style="width: 200px; height: 200px; display: block; margin: 16px 0;" />
  <p style="color: #666; font-size: 14px;">This link expires in 24 hours. If it has expired, ask your administrator to resend the invitation.</p>
  <p style="color: #666; font-size: 14px;">Once activated, open Viber and message the bot to get started.</p>
</body>
</html>`
}

async function handlePOST(req: Request, _ctx: any) {
    const body = await req.json()
    const { clerkUserId, sendEmail: shouldSendEmail } = body

    if (!clerkUserId) {
        return NextResponse.json({ error: 'Missing clerkUserId' }, { status: 400 })
    }

    const botUri = process.env.VIBER_BOT_URI
    const botName = process.env.VIBER_BOT_NAME || 'Sales-Recon'
    if (!botUri) {
        return NextResponse.json({ error: 'VIBER_BOT_URI not configured' }, { status: 500 })
    }

    const code = generateLinkCode(10)
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS)

    await prisma.viberLinkCode.create({
        data: { code, clerkUserId, expiresAt },
    })

    const deepLink = `viber://pa?chatURI=${encodeURIComponent(botUri)}&context=${encodeURIComponent(code)}`

    let emailSent = false
    if (shouldSendEmail) {
        try {
            const client = await clerkClient()
            const user = await client.users.getUser(clerkUserId)
            const email = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
            const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || email || 'there'

            if (email) {
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(deepLink)}`
                const subject = `Invitation to ${botName} Intelligence Service`
                const html = buildInviteEmail({ name, botName, deepLink, qrUrl })
                await sendPlainEmail(email, subject, html)
                emailSent = true
            }
        } catch (err) {
            console.error('[admin/viber/grant] email send failed:', err)
        }
    }

    return NextResponse.json({ deepLink, expiresAt: expiresAt.toISOString(), emailSent })
}

export const POST = withAuth(handlePOST, { requireRole: 'manageEvents' }) as any
