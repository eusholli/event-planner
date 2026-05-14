'use client'

type Guard = () => boolean

let guard: Guard | null = null

export function setNavGuard(fn: Guard | null) {
    guard = fn
}

export function shouldAllowNavigation(): boolean {
    if (!guard) return true
    try {
        return guard()
    } catch {
        return true
    }
}
