"use client";

import { Suspense } from "react";
import Link from "next/link";
import IntelligenceChat from "@/components/IntelligenceChat";

export default function StandaloneIntelligencePage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading OpenClaw Insights...</div>}>
            <div className="relative">
                <div className="absolute top-4 right-4 z-20">
                    <Link
                        href="/intelligence/subscribe"
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 underline underline-offset-2 transition-colors"
                    >
                        Subscribe to Briefings
                    </Link>
                </div>
                <IntelligenceChat />
            </div>
        </Suspense>
    );
}
