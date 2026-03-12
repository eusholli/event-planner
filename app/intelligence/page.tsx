"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import IntelligenceChat from "@/components/IntelligenceChat";

function IntelligenceChatWithParams() {
    const searchParams = useSearchParams();
    const eventId = searchParams.get("eventId") ?? undefined;
    return <IntelligenceChat eventId={eventId} />;
}

export default function StandaloneIntelligencePage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading OpenClaw Insights...</div>}>
            <div className="relative">
                <IntelligenceChatWithParams />
            </div>
        </Suspense>
    );
}
