'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignInButton, SignUpButton, UserButton, SignedIn, SignedOut, useUser } from '@/components/auth'
import { Roles } from '@/lib/constants'

export default function Navigation() {
    const [isOpen, setIsOpen] = useState(false)
    const pathname = usePathname()
    const { user } = useUser()

    // Extract Event ID from path: /events/[id]/...
    const eventIdMatch = pathname?.match(/^\/events\/([^\/]+)/)
    const eventId = eventIdMatch ? eventIdMatch[1] : null

    // Core Links (Global)
    const portfolioLink = { href: '/events', label: 'Events' }

    // Event Links (Scoped)
    const eventLinks = eventId ? [
        { href: `/events/${eventId}/dashboard`, label: 'Dashboard' },

        { href: `/events/${eventId}/new-meeting`, label: 'New Meeting', roles: [Roles.Root, Roles.Admin, Roles.Marketing] },
        { href: `/events/${eventId}/attendees`, label: 'Attendees' },
        { href: `/events/${eventId}/rooms`, label: 'Rooms', roles: [Roles.Root, Roles.Admin, Roles.Marketing] },
        { href: `/events/${eventId}/calendar`, label: 'Calendar' },
        { href: `/events/${eventId}/chat`, label: 'Chat' },
        { href: `/events/${eventId}/reports`, label: 'Reports', roles: [Roles.Root, Roles.Admin, Roles.Marketing] },

    ] : []

    // Admin Links (Global)
    const adminLinks = [
        { href: '/admin/users', label: 'Users', roles: [Roles.Root] },
        { href: '/admin/system', label: 'System', roles: [Roles.Root] }, // New System Settings
    ]

    // Determine which links to show
    let linksToShow: any[] = []

    if (eventId) {
        // We are in an event
        linksToShow = [portfolioLink, ...eventLinks]
    } else {
        // Global View
        linksToShow = [portfolioLink, ...adminLinks]
    }

    const links = linksToShow.filter(link => {
        if (!link.roles) return true
        return user?.publicMetadata?.role && link.roles.includes(user.publicMetadata.role as string)
    })

    const isActive = (path: string) => pathname === path || pathname?.startsWith(`${path}/`)

    return (
        <nav className="fixed top-0 w-full z-50 glass">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <div className="flex-shrink-0 flex items-center">
                            <Link href="/events" className="text-xl font-bold tracking-tight text-zinc-900">
                                AI Event Planner
                            </Link>
                        </div>
                        <SignedIn>
                            <div className="hidden sm:ml-10 sm:flex sm:space-x-8">
                                {links.map(link => (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 ${isActive(link.href)
                                            ? 'border-zinc-900 text-zinc-900'
                                            : 'border-transparent text-zinc-500 hover:text-zinc-900 hover:border-zinc-300'
                                            }`}
                                    >
                                        {link.label}
                                    </Link>
                                ))}
                            </div>
                        </SignedIn>
                    </div>

                    <div className="hidden sm:flex sm:items-center sm:ml-6 space-x-4">
                        <SignedOut>
                            <SignInButton mode="modal">
                                <button className="text-zinc-500 hover:text-zinc-900 font-medium text-sm">
                                    Sign In
                                </button>
                            </SignInButton>
                            <SignUpButton mode="modal">
                                <button className="bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                    Sign Up
                                </button>
                            </SignUpButton>
                        </SignedOut>
                        <SignedIn>
                            <UserButton afterSignOutUrl="/" />
                        </SignedIn>
                    </div>

                    <div className="-mr-2 flex items-center sm:hidden">
                        <SignedIn>
                            <UserButton afterSignOutUrl="/" />
                        </SignedIn>
                        <div className="ml-4">
                            <button
                                onClick={() => setIsOpen(!isOpen)}
                                type="button"
                                className="inline-flex items-center justify-center p-2 rounded-md text-zinc-400 hover:text-zinc-500 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-500"
                                aria-controls="mobile-menu"
                                aria-expanded="false"
                            >
                                <span className="sr-only">Open main menu</span>
                                {!isOpen ? (
                                    <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                ) : (
                                    <svg className="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile menu */}
            <SignedIn>
                <div className={`${isOpen ? 'block' : 'hidden'} sm:hidden glass border-t border-zinc-100`} id="mobile-menu">
                    <div className="pt-2 pb-3 space-y-1 px-2">
                        {links.map(link => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setIsOpen(false)}
                                className={`block pl-3 pr-4 py-2 rounded-lg text-base font-medium transition-colors ${isActive(link.href)
                                    ? 'bg-zinc-100 text-zinc-900'
                                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                                    }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
            </SignedIn>

            <SignedOut>
                <div className={`${isOpen ? 'block' : 'hidden'} sm:hidden glass border-t border-zinc-100 p-4 space-y-4`}>
                    <SignInButton mode="modal">
                        <button className="w-full text-center text-zinc-500 hover:text-zinc-900 font-medium text-sm py-2">
                            Sign In
                        </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                        <button className="w-full bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            Sign Up
                        </button>
                    </SignUpButton>
                </div>
            </SignedOut>
        </nav>
    )
}
