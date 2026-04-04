'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignInButton, SignUpButton, UserButton, SignedIn, SignedOut, useUser } from '@/components/auth'
import { Roles } from '@/lib/constants'
import { ChevronDown } from 'lucide-react'

// Internal Dropdown Component
function NavDropdown({ label, items, isActive }: { label: string, items: any[], isActive: boolean }) {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200 h-16 ${isActive
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900 hover:border-zinc-300'
                    }`}
            >
                {label}
                <ChevronDown className={`ml-1 h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-0 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50 py-1">
                    {items.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsOpen(false)}
                            className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function Navigation() {
    const [isOpen, setIsOpen] = useState(false)
    const [openGroup, setOpenGroup] = useState<string | null>(null)
    const pathname = usePathname()
    const { user } = useUser()

    // Extract Event ID from path: /events/[id]/...
    const eventIdMatch = pathname?.match(/^\/events\/([^\/]+)/)
    const eventId = eventIdMatch ? eventIdMatch[1] : null

    // Core Links (Global)
    const coreLinks = [
        { href: '/events', label: 'Events' },
        { href: '/intelligence', label: 'OpenClaw Insights' }
    ]

    // Admin Links (Global)
    const adminLinks = [
        { href: '/admin/users', label: 'Users', roles: [Roles.Root, Roles.Marketing] },
        { href: '/admin/system', label: 'System', roles: [Roles.Root] },
        { href: '/admin/data-ingestion', label: 'Data Ingestion', roles: [Roles.Root, Roles.Marketing] },
        { href: '/admin/ai-logs', label: 'AI Usage Report', roles: [Roles.Root] },
    ]

    // Event Groups (Scoped)
    const eventGroups = eventId ? [
        {
            label: 'Performance',
            items: [
                { href: `/events/${eventId}/dashboard`, label: 'Dashboard' },
                { href: `/events/${eventId}/roi`, label: 'ROI' },
                { href: `/events/${eventId}/reports`, label: 'Reports' },
                { href: `/events/${eventId}/linkedin-campaigns`, label: 'LinkedIn Campaigns', roles: [Roles.Root, Roles.Marketing] },
            ]
        },
        {
            label: 'Audience',
            items: [
                { href: `/events/${eventId}/attendees`, label: 'Attendees' },
                { href: `/events/${eventId}/companies`, label: 'Companies' },
            ]
        },
        {
            label: 'Logistics',
            items: [
                { href: `/events/${eventId}/new-meeting`, label: 'New Meeting', roles: [Roles.Root, Roles.Admin, Roles.Marketing, Roles.User] },
                { href: `/events/${eventId}/calendar`, label: 'Calendar' },
                { href: `/events/${eventId}/rooms`, label: 'Rooms', roles: [Roles.Root, Roles.Admin, Roles.Marketing] },
            ]
        }
    ] : []

    const userRole = user?.publicMetadata?.role as string

    const filterItem = (item: any) => {
        if (!item.roles) return true
        return userRole && item.roles.includes(userRole)
    }

    const isActive = (path: string) => pathname === path || pathname?.startsWith(`${path}/`)
    const isGroupActive = (items: any[]) => items.some(item => isActive(item.href))

    return (
        <nav className="fixed top-0 w-full z-50 glass">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16">
                    <div className="flex">
                        <div className="flex-shrink-0 flex items-center">
                            <Link href="/" className="relative text-xl font-bold tracking-tight text-zinc-900">
                                AI Event Planner
                                <sup className="absolute -top-2 -right-8 text-[10px] font-semibold tracking-wide text-zinc-400">
                                    Alpha
                                </sup>
                            </Link>
                        </div>
                        <SignedIn>
                            <div className="hidden sm:ml-10 sm:flex sm:space-x-8">
                                {coreLinks.map(link => (
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

                                {eventId && eventGroups.map(group => {
                                    const filteredItems = group.items.filter(filterItem)
                                    if (filteredItems.length === 0) return null
                                    return (
                                        <NavDropdown
                                            key={group.label}
                                            label={group.label}
                                            items={filteredItems}
                                            isActive={isGroupActive(filteredItems)}
                                        />
                                    )
                                })}

                                {!eventId && adminLinks.filter(filterItem).map(link => (
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
                                <button className="text-zinc-500 hover:text-zinc-900 font-medium text-sm cursor-pointer">
                                    Sign In
                                </button>
                            </SignInButton>
                            <SignUpButton mode="modal">
                                <button className="bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer">
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
                <div className={`${isOpen ? 'block' : 'hidden'} sm:hidden glass border-t border-zinc-100 max-h-[calc(100vh-4rem)] overflow-y-auto`} id="mobile-menu">
                    <div className="pt-2 pb-3 space-y-1 px-2">
                        {coreLinks.map(link => (
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

                        {eventId && eventGroups.map(group => {
                            const filteredItems = group.items.filter(filterItem)
                            if (filteredItems.length === 0) return null
                            const groupIsExpanded = openGroup === group.label
                            return (
                                <div key={group.label} className="space-y-1">
                                    <button
                                        onClick={() => setOpenGroup(groupIsExpanded ? null : group.label)}
                                        className={`w-full flex justify-between items-center pl-3 pr-4 py-2 rounded-lg text-base font-medium transition-colors ${isGroupActive(filteredItems)
                                            ? 'text-zinc-900'
                                            : 'text-zinc-500'
                                            }`}
                                    >
                                        {group.label}
                                        <ChevronDown className={`h-4 w-4 transition-transform ${groupIsExpanded ? 'rotate-180' : ''}`} />
                                    </button>
                                    {groupIsExpanded && (
                                        <div className="pl-6 space-y-1">
                                            {filteredItems.map(item => (
                                                <Link
                                                    key={item.href}
                                                    href={item.href}
                                                    onClick={() => setIsOpen(false)}
                                                    className={`block pl-3 pr-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive(item.href)
                                                        ? 'bg-zinc-50 text-zinc-900'
                                                        : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                                                        }`}
                                                >
                                                    {item.label}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {!eventId && adminLinks.filter(filterItem).map(link => (
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
                        <button className="w-full text-center text-zinc-500 hover:text-zinc-900 font-medium text-sm py-2 cursor-pointer">
                            Sign In
                        </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                        <button className="w-full bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer">
                            Sign Up
                        </button>
                    </SignUpButton>
                </div>
            </SignedOut>
        </nav>
    )
}
