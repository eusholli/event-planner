import Link from 'next/link'
import { SignInButton, SignUpButton, SignedIn, SignedOut } from '@/components/auth'

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-8">
      <div className="space-y-4 max-w-3xl">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-zinc-900">
          Executive Meeting <span className="text-indigo-600">Coordinator</span>
        </h1>
        <p className="text-xl text-zinc-500 max-w-2xl mx-auto leading-relaxed">
          Orchestrate complex events with a context-aware AI that handles the scheduling, logistics, and attendee dossiers for you.
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
          <Link href="/chat">
            <button className="px-8 py-4 bg-indigo-600 text-white rounded-full font-semibold text-lg hover:bg-indigo-500 transition-all hover:scale-105 shadow-lg shadow-indigo-200">
              Try the AI Assistant
            </button>
          </Link>
          <Link href="/dashboard">
            <button className="px-8 py-4 bg-white text-zinc-900 border border-zinc-200 rounded-full font-semibold text-lg hover:bg-zinc-50 transition-all hover:scale-105">
              Dashboard
            </button>
          </Link>
        </SignedIn>
      </div>

      <div className="pt-16 grid grid-cols-1 md:grid-cols-3 gap-8 text-left max-w-5xl mx-auto px-4">
        {/* Card 1: AI Assistant */}
        <div className="p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 text-indigo-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Your Dedicated AI Assistant</h3>
          <p className="text-zinc-500">Delegate logistics to an agent that understands your event. Just ask to find rooms, schedule clusters, or draft invites.</p>
        </div>

        {/* Card 2: Auto-Complete (Dossiers) */}
        <div className="p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 text-indigo-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Zero-Data Entry Files</h3>
          <p className="text-zinc-500">Type a name, and watch the system build a complete profile. Auto-enrichment means you never manually type a bio again.</p>
        </div>

        {/* Card 3: Data Control */}
        <div className="p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 text-indigo-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-2">Executive Command Center</h3>
          <p className="text-zinc-500">Retain full control with powerful data tools. Import, export, and manage your organization's entire meeting landscape.</p>
        </div>
      </div>
    </div >
  )
}
