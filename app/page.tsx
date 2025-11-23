import Link from 'next/link'
import { SignInButton, SignUpButton, SignedIn, SignedOut } from '@clerk/nextjs'

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-8">
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-zinc-900">
          Executive Meeting <span className="text-indigo-600">Coordinator</span>
        </h1>
        <p className="text-xl text-zinc-500 max-w-2xl mx-auto leading-relaxed">
          Streamline your event planning with AI-powered attendee management, intelligent scheduling, and seamless coordination.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 pt-4">
        <SignedOut>
          <SignUpButton mode="modal">
            <button className="px-8 py-4 bg-zinc-900 text-white rounded-full font-semibold text-lg hover:bg-zinc-800 transition-all hover:scale-105 shadow-lg shadow-zinc-200">
              Get Started for Free
            </button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className="px-8 py-4 bg-white text-zinc-900 border border-zinc-200 rounded-full font-semibold text-lg hover:bg-zinc-50 transition-all hover:scale-105">
              Sign In
            </button>
          </SignInButton>
        </SignedOut>

        <SignedIn>
          <Link href="/dashboard">
            <button className="px-8 py-4 bg-indigo-600 text-white rounded-full font-semibold text-lg hover:bg-indigo-500 transition-all hover:scale-105 shadow-lg shadow-indigo-200">
              Go to Dashboard
            </button>
          </Link>
        </SignedIn>
      </div>

      <div className="pt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left max-w-5xl mx-auto px-4">
        <div className="p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 text-indigo-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Attendee Management</h3>
          <p className="text-zinc-500">Effortlessly manage guest lists with AI-powered profile completion and organization.</p>
        </div>
        <div className="p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 text-indigo-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Smart Scheduling</h3>
          <p className="text-zinc-500">Coordinate meetings and sessions with an intuitive drag-and-drop calendar interface.</p>
        </div>
        <div className="p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 text-indigo-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Data Control</h3>
          <p className="text-zinc-500">Full control over your data with easy import, export, and backup capabilities.</p>
        </div>
      </div>
    </div>
  )
}
