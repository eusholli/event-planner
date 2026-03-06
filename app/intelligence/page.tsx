"use client";

import { Suspense } from "react";
import IntelligenceChat from "@/components/IntelligenceChat";

export default function StandaloneIntelligencePage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading OpenClaw Insights...</div>}>
            <IntelligenceChat />
        </Suspense>
    );
}
