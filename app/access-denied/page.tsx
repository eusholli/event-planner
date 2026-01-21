import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export default function AccessDeniedPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>

                <div className="space-y-2">
                    <h1 className="text-2xl font-bold text-neutral-900">Access Denied</h1>
                    <p className="text-neutral-500">
                        You do not have permission to view this page. If you believe this is an error, please contact the event administrator.
                    </p>
                </div>

                <div className="pt-4">
                    <Link
                        href="/events"
                        className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm w-full sm:w-auto"
                    >
                        Back to Events
                    </Link>
                </div>
            </div>
        </div>
    )
}
