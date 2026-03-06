"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import IntelligenceChat from "@/components/IntelligenceChat";

function IntelligenceContent() {
    const params = useParams();
    const eventId = params?.id as string;

    return <IntelligenceChat eventId={eventId} />;
}

export default function IntelligencePage() {
    return (
        <Suspense fallback={<div className="p-10 text-center text-zinc-500">Loading OpenClaw Insights...</div>}>
            <IntelligenceContent />
        </Suspense>
    );
}
