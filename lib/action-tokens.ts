import { createHmac, timingSafeEqual } from 'crypto'

export type ActionTokenPayload = {
  userId: string
  role: string
  email: string
  iat: number
  exp: number
}

export const ACTION_TOKEN_TTL_MS = 4 * 60 * 60 * 1000 // 4 hours in ms
const TTL = ACTION_TOKEN_TTL_MS

export function signActionToken(userId: string, role: string, email: string): string {
  const payload: ActionTokenPayload = {
    userId,
    role,
    email,
    iat: Date.now(),
    exp: Date.now() + TTL
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', process.env.CRON_SECRET_KEY!)
    .update(data)
    .digest('base64url')
  return `${data}.${sig}`
}

export function verifyActionToken(token: string): ActionTokenPayload | null {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return null
    const data = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = createHmac('sha256', process.env.CRON_SECRET_KEY!)
      .update(data)
      .digest('base64url')
    // Timing-safe comparison to prevent timing attacks
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null
    const p: ActionTokenPayload = JSON.parse(Buffer.from(data, 'base64url').toString())
    return Date.now() > p.exp ? null : p
  } catch {
    return null
  }
}
