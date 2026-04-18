import { v4 as uuidv4 } from 'uuid'

export function isPlaceholderEmail(email: string): boolean {
    return email.endsWith('@placeholder.invalid')
}

export function generatePlaceholderEmail(): string {
    return `no-email-${uuidv4()}@placeholder.invalid`
}
