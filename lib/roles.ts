import { auth } from '@clerk/nextjs/server'
import { Roles } from './constants'

export { Roles }

export const checkRole = async (role: string) => {
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') {
        return role === Roles.Root
    }
    const { sessionClaims } = await auth()
    return sessionClaims?.metadata?.role === role
}

import { hasWriteAccess } from './role-utils'

export const isRootUser = async () => {
    return checkRole(Roles.Root)
}

export const canWrite = async () => {
    if (process.env.NEXT_PUBLIC_DISABLE_CLERK_AUTH === 'true') {
        return true
    }
    const { sessionClaims } = await auth()
    const role = sessionClaims?.metadata?.role as string
    return hasWriteAccess(role)
}
