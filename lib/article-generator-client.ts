// lib/article-generator-client.ts

// ── Request ──────────────────────────────────────────────────────────────────

export interface GenerateRequest {
  draft: string
  target_score?: number        // default 89.0
  max_iterations?: number      // default 10
  word_count_min?: number      // default 2000
  word_count_max?: number      // default 2500
  model?: string
  generator_model?: string | null
  judge_model?: string | null
  rag_model?: string | null
  humanizer_model?: string | null
  recreate_ctx?: boolean
}

// ── SSE Events ───────────────────────────────────────────────────────────────

export type ProgressStage =
  | 'init' | 'start' | 'rag_search' | 'rag_queries' | 'rag_complete'
  | 'context' | 'generating' | 'scoring' | 'scored' | 'fact_checking'
  | 'fact_check_results' | 'fact_check_passed' | 'fact_check_failed'
  | 'citation_issues' | 'humanizing' | 'humanized' | 'complete_version' | 'info'

export interface ProgressEvent {
  type: 'progress'
  stage: ProgressStage
  message: string
}

export interface HeartbeatEvent {
  type: 'heartbeat'
}

export interface ArticleScore {
  percentage: number
  performance_tier: 'World-class' | 'Strong' | 'Needs restructuring' | 'Rework'
  word_count: number
  meets_requirements: boolean
  overall_feedback: string | null
}

export interface ArticleResult {
  original: string
  humanized: string
}

export interface CompleteEvent {
  type: 'complete'
  article: ArticleResult
  score: ArticleScore
  target_achieved: boolean
  iterations_used: number
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export type ArticleGeneratorEvent =
  | ProgressEvent
  | HeartbeatEvent
  | CompleteEvent
  | ErrorEvent

// ── Callbacks ────────────────────────────────────────────────────────────────

export interface GenerationCallbacks {
  onProgress?: (stage: string, message: string) => void
  onHeartbeat?: () => void
  onComplete: (event: CompleteEvent) => void
  onError: (message: string) => void
}

// ── Client ───────────────────────────────────────────────────────────────────

export function generateArticle(
  baseUrl: string,
  request: GenerateRequest,
  callbacks: GenerationCallbacks
): AbortController {
  const controller = new AbortController()

  ;(async () => {
    let response: Response

    try {
      response = await fetch(`${baseUrl}/articles/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      callbacks.onError(`Network error: ${(err as Error).message}`)
      return
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      callbacks.onError(`HTTP ${response.status}: ${body}`)
      return
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const dataLine = part.split('\n').find(line => line.startsWith('data: '))
          if (!dataLine) continue

          let event: ArticleGeneratorEvent
          try {
            event = JSON.parse(dataLine.slice(6)) as ArticleGeneratorEvent
          } catch {
            continue
          }

          if (event.type === 'heartbeat') {
            callbacks.onHeartbeat?.()
          } else if (event.type === 'progress') {
            callbacks.onProgress?.(event.stage, event.message)
          } else if (event.type === 'complete') {
            callbacks.onComplete(event)
            return
          } else if (event.type === 'error') {
            callbacks.onError(event.message)
            return
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      callbacks.onError(`Stream error: ${(err as Error).message}`)
    } finally {
      reader.releaseLock()
    }
  })()

  return controller
}

export async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`)
    const data = await res.json()
    return data.status === 'ok'
  } catch {
    return false
  }
}
