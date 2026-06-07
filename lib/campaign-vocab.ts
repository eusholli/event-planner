import prisma from '@/lib/prisma'

export type SuggestedTask = {
  title: string
  description?: string
  contentType?: string | null
  tags?: string[]
}

/** The system content-task vocabulary (editable at /admin/system). */
export async function getCampaignVocab(): Promise<{ allowedContentTypes: string[]; allowedTags: string[] }> {
  const settings = await prisma.systemSettings.findFirst({
    select: { defaultContentTypes: true, defaultTags: true },
  })
  return {
    allowedContentTypes: settings?.defaultContentTypes ?? [],
    allowedTags: settings?.defaultTags ?? [],
  }
}

/**
 * Coerce agent/LLM-suggested content tasks to the system vocabulary: drop a
 * contentType not in allowedContentTypes (case-insensitive → canonical casing), and
 * keep only tags present in allowedTags. Lenient — never throws, just normalizes.
 */
export function coerceSuggestedTasks(raw: unknown, allowedTypes: string[], allowedTags: string[]): SuggestedTask[] {
  if (!Array.isArray(raw)) return []
  const typeByLower = new Map(allowedTypes.map((t) => [t.toLowerCase(), t]))
  const tagByLower = new Map(allowedTags.map((t) => [t.toLowerCase(), t]))
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter((item) => typeof item.title === 'string' && (item.title as string).trim().length > 0)
    .map((item) => {
      const contentType =
        typeof item.contentType === 'string' ? typeByLower.get(item.contentType.toLowerCase()) ?? null : null
      const tags = Array.isArray(item.tags)
        ? Array.from(
            new Set(
              (item.tags as unknown[])
                .filter((x): x is string => typeof x === 'string')
                .map((x) => tagByLower.get(x.toLowerCase()))
                .filter((x): x is string => !!x),
            ),
          )
        : []
      return {
        title: (item.title as string).trim(),
        description: typeof item.description === 'string' ? item.description : undefined,
        contentType,
        tags,
      }
    })
}
