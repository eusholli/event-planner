// lib/article-generator-client.ts

// ── Article types ─────────────────────────────────────────────────────────────

export type ArticleType =
  | 'thought_leadership'
  | 'awareness'
  | 'demand_gen'
  | 'event_attendance'
  | 'recruitment'
  | 'product_announcement'
  | 'case_study'

// ── Requests ──────────────────────────────────────────────────────────────────

export interface GenerateRequest {
  draft: string
  article_type?: ArticleType
  target_score?: number             // default 89.0
  max_iterations?: number           // always 1; kept for backwards compat
  word_count_min?: number           // default 1500
  word_count_max?: number           // default 2000
  model?: string
  generator_model?: string | null
  judge_model?: string | null
  rag_model?: string | null
  fact_check?: boolean              // default true
}

export interface HumanizeRequest {
  article: string
  model?: string
  humanizer_model?: string | null
  use_undetectable?: boolean        // default false
}

// ── SSE Events ───────────────────────────────────────────────────────────────

export type GenerateProgressStage =
  | 'init' | 'start' | 'rag_search' | 'rag_queries' | 'rag_complete'
  | 'context' | 'generating' | 'scoring' | 'scored' | 'fact_checking'
  | 'fact_check_results' | 'fact_check_passed' | 'fact_check_failed'
  | 'citation_issues' | 'complete_generation' | 'info'

export type HumanizeProgressStage =
  | 'humanizing' | 'humanized'
  | 'humanizing_api' | 'humanizing_api_progress' | 'humanizing_api_done'

export type ProgressStage = GenerateProgressStage | HumanizeProgressStage

export interface ProgressEvent {
  type: 'progress'
  stage: ProgressStage
  message: string
}

export interface HeartbeatEvent {
  type: 'heartbeat'
}

export interface ArticleScore {
  percentage: number | null
  performance_tier: 'World-class' | 'Strong' | 'Needs restructuring' | 'Rework' | null
  word_count: number
  meets_requirements: boolean
  overall_feedback: string | null
}

export interface FactCheckResult {
  passed: boolean
  summary: string
}

export interface GenerateCompleteEvent {
  type: 'complete'
  article: { text: string }
  score: ArticleScore
  fact_check: FactCheckResult | null
  target_achieved: boolean
  iterations_used: number
}

export interface HumanizeCompleteEvent {
  type: 'complete'
  article: { humanized: string }
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export type ArticleGeneratorEvent =
  | ProgressEvent
  | HeartbeatEvent
  | GenerateCompleteEvent
  | ErrorEvent

export type HumanizerEvent =
  | ProgressEvent
  | HeartbeatEvent
  | HumanizeCompleteEvent
  | ErrorEvent

// ── Health ───────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok'
  timestamp: string // ISO 8601
}

// ── Callbacks ────────────────────────────────────────────────────────────────

export interface GenerationCallbacks {
  onProgress?: (stage: ProgressStage, message: string) => void
  onHeartbeat?: () => void
  onComplete: (event: GenerateCompleteEvent) => void
  onError: (message: string) => void
}

export interface HumanizationCallbacks {
  onProgress?: (stage: ProgressStage, message: string) => void
  onHeartbeat?: () => void
  onComplete: (event: HumanizeCompleteEvent) => void
  onError: (message: string) => void
}

// ── Shared SSE streaming helper ───────────────────────────────────────────────

function streamSse<TEvent extends { type: string }, TComplete extends TEvent>(
  url: string,
  body: unknown,
  clerkToken: string | undefined,
  onProgress: ((stage: ProgressStage, message: string) => void) | undefined,
  onHeartbeat: (() => void) | undefined,
  onComplete: (event: TComplete) => void,
  onError: (message: string) => void
): AbortController {
  const controller = new AbortController()

  ;(async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }
    if (clerkToken) {
      headers['Authorization'] = `Bearer ${clerkToken}`
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      onError(`Network error: ${(err as Error).message}`)
      return
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      onError(`HTTP ${response.status}: ${text}`)
      return
    }

    if (!response.body) {
      onError('Response has no body')
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split(/\r?\n\r?\n/)
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const dataLine = part.split('\n').find(line => line.startsWith('data: '))
          if (!dataLine) continue

          let event: TEvent
          try {
            event = JSON.parse(dataLine.slice(6)) as TEvent
          } catch {
            continue
          }

          if (event.type === 'heartbeat') {
            onHeartbeat?.()
          } else if (event.type === 'progress') {
            const e = event as unknown as ProgressEvent
            onProgress?.(e.stage, e.message)
          } else if (event.type === 'complete') {
            onComplete(event as unknown as TComplete)
            return
          } else if (event.type === 'error') {
            const e = event as unknown as ErrorEvent
            onError(e.message)
            return
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      onError(`Stream error: ${(err as Error).message}`)
    } finally {
      reader.releaseLock()
    }
  })()

  return controller
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a LinkedIn article by streaming SSE events from the API.
 *
 * Returns an AbortController — call controller.abort() to cancel.
 */
export function generateArticle(
  baseUrl: string,
  request: GenerateRequest,
  callbacks: GenerationCallbacks,
  clerkToken?: string
): AbortController {
  return streamSse<ArticleGeneratorEvent, GenerateCompleteEvent>(
    `${baseUrl}/articles/generate`,
    request,
    clerkToken,
    callbacks.onProgress,
    callbacks.onHeartbeat,
    callbacks.onComplete,
    callbacks.onError
  )
}

/**
 * Humanize a pre-generated article by streaming SSE events from the API.
 *
 * Returns an AbortController — call controller.abort() to cancel.
 */
export function humanizeArticle(
  baseUrl: string,
  request: HumanizeRequest,
  callbacks: HumanizationCallbacks,
  clerkToken?: string
): AbortController {
  return streamSse<HumanizerEvent, HumanizeCompleteEvent>(
    `${baseUrl}/humanize`,
    request,
    clerkToken,
    callbacks.onProgress,
    callbacks.onHeartbeat,
    callbacks.onComplete,
    callbacks.onError
  )
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
