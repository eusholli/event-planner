"use client";

import { Suspense } from "react";
import Link from "next/link";
import IntelligenceChat from "@/components/IntelligenceChat";

export default function StandaloneIntelligencePage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading OpenClaw Insights...</div>}>
            <div className="relative">
                <IntelligenceChat />
            </div>
        </Suspense>
    );
}
