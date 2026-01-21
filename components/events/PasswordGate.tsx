'use client'

import { useState } from 'react'
import { verifyEventPassword } from '@/app/events/actions'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'

interface PasswordGateProps {
    eventId: string
    eventName: string
}

export function PasswordGate({ eventId, eventName }: PasswordGateProps) {
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const res = await verifyEventPassword(eventId, password)
            if (res.success) {
                router.refresh()
            } else {
                setError(res.error || 'Incorrect password')
                // redirect to access-denied if needed, but per requirements:
                // "If the secret password does not match then send them to the 'access-denied' page."
                // I will do CLIENT side redirect on failure? Or just show error?
                // The req says "send them to the access-denied page".
                // I'll show error for UX, but technically I should redirect? 
                // Redirecting on first typo is bad UX. I'll show error, but if I MUST follow strict reqs:
                if (res.error === 'Incorrect password') {
                    router.push('/access-denied')
                }
            }
        } catch (err) {
            setError('An error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-neutral-200">
                <div className="text-center mb-6">
                    <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                        <Lock className="w-6 h-6 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-neutral-900">Protected Event</h2>
                    <p className="text-neutral-500 mt-1">
                        Enter the password to access <span className="font-semibold text-neutral-800">{eventName}</span>
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full rounded-md border-neutral-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                            placeholder="Enter event password"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-100">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                    >
                        {loading ? 'Verifying...' : 'Access Event'}
                    </button>
                </form>
            </div>
        </div>
    )
}
