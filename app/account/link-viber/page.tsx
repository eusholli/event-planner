'use client'

import { useState } from 'react'

type LinkResponse = {
    code: string
    deepLink: string
    expiresAt: string
}

// Inline SVG QR via Google Chart API fallback isn't great; use a free public
// QR endpoint instead. The deep link itself is non-sensitive (single-use,
// 10-min TTL, server-validated), so a third-party QR encoder is acceptable.
function qrUrl(data: string, size = 256): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`
}

export default function LinkViberPage() {
    const [link, setLink] = useState<LinkResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function generateLink() {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/viber/link/create', { method: 'POST' })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data.error || `Request failed (${res.status})`)
            }
            setLink(await res.json())
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto p-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Link Viber</h1>
            <p className="text-slate-600 mb-8">
                Connect your Viber account so the Sales-Recon bot can recognise you in 1:1 chats and in
                Viber Communities the bot has been added to.
            </p>

            <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-6 space-y-6">
                {!link && (
                    <button
                        type="button"
                        disabled={loading}
                        onClick={generateLink}
                        className="btn-primary"
                    >
                        {loading ? 'Generating…' : 'Generate Viber Link'}
                    </button>
                )}

                {error && (
                    <p className="text-red-600 text-sm">{error}</p>
                )}

                {link && (
                    <div className="space-y-4">
                        <div>
                            <h2 className="font-semibold text-slate-900 mb-2">On your phone</h2>
                            <p className="text-sm text-slate-600 mb-3">
                                Tap the button below to open Viber. The bot will reply &ldquo;Account linked!&rdquo;
                                once your account is connected.
                            </p>
                            <a
                                href={link.deepLink}
                                className="btn-primary inline-block"
                            >
                                Open Viber
                            </a>
                        </div>

                        <div>
                            <h2 className="font-semibold text-slate-900 mb-2">On a different device</h2>
                            <p className="text-sm text-slate-600 mb-3">
                                Scan this QR code with your phone&rsquo;s camera or Viber&rsquo;s built-in scanner.
                            </p>
                            { /* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={qrUrl(link.deepLink, 256)}
                                alt="Viber link QR code"
                                width={256}
                                height={256}
                                className="border border-slate-200 rounded"
                            />
                        </div>

                        <p className="text-xs text-slate-500">
                            Code <code className="font-mono">{link.code}</code> &middot; expires{' '}
                            {new Date(link.expiresAt).toLocaleTimeString()}
                        </p>

                        <button
                            type="button"
                            onClick={generateLink}
                            disabled={loading}
                            className="text-sm text-slate-600 underline hover:text-slate-900"
                        >
                            Generate a new link
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
