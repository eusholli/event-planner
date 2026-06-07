import prisma from '@/lib/prisma'

// Default Rakuten Symphony brand voice — seeded from li-agent/symphony-brand-voice.md.
// Used as the fallback when SystemSettings.brandVoice is empty. Marketing can override
// it (editable on /admin/system) without a code change.
export const DEFAULT_BRAND_VOICE = `# Rakuten Symphony Brand Voice

## BRAND IDENTITY
- Disruptive, visionary, pragmatic. Bold challenger in telecom.
- Tagline: "Intelligent Growth."
- Focus: data-driven operations, ecosystem revenue growth, AI-driven operational efficiency.
- Target audience: CTOs and VP Ops at tier-1 and tier-2 telcos.

## TONE & VOICE
- Confident, professional, optimistic. Quiet boldness.
- Challenge legacy approaches by showing better alternatives — never attacking incumbents.
- Write like first-principles thinking: strip analogies, deconstruct complex systems, minimal text, clear logic.

## FORBIDDEN WORDS
- delve, tapestry, landscape, unlock, leverage, game-changer, overarching, paramount, in conclusion, it is important to note
- No three adjectives in a row. No drama. No unnecessary metaphors.

## STRUCTURE
- Use PAS (Problem -> Agitation -> Solution) or AIDA framework.
- Mix very short punchy sentences (1-4 words) with longer technical explanations.

## PRODUCT LANGUAGE
- Use descriptive product terms (e.g. "network orchestration platform"); never legacy "SymXXX" names.`

/**
 * The active brand-voice spec to inject into content-draft prompts. Returns the
 * marketing-edited SystemSettings.brandVoice, or the built-in default when unset.
 */
export async function getBrandVoice(): Promise<string> {
    const settings = await prisma.systemSettings.findFirst({ select: { brandVoice: true } })
    const v = settings?.brandVoice?.trim()
    return v && v.length > 0 ? v : DEFAULT_BRAND_VOICE
}
