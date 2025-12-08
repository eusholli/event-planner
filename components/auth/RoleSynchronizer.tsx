'use client'

import { useEffect } from 'react'
import { useUser } from '@/components/auth'

export const RoleSynchronizer = () => {
    const { user, isLoaded } = useUser()

    useEffect(() => {
        if (isLoaded && user && !user.publicMetadata.role) {
            const initRole = async () => {
                try {
                    await fetch('/api/user/init', { method: 'POST' })
                    // Force a token refresh to get the new metadata
                    if (user.reload) {
                        await user.reload()
                    }
                } catch (error) {
                    console.error('Failed to initialize user role:', error)
                }
            }
            initRole()
        }
    }, [isLoaded, user])

    return null
}
