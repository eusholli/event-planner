
import { Roles } from './constants'

export const hasWriteAccess = (role?: string) => {
    return role === Roles.Root || role === Roles.Admin || role === Roles.Marketing
}

export const canManageEvents = (role?: string) => {
    return role === Roles.Root || role === Roles.Marketing
}

export const hasCreateAccess = (role?: string) => {
    return role === Roles.Root || role === Roles.Admin || role === Roles.User
}
