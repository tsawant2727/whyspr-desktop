import OpenAI from 'openai'
import { EventEmitter } from 'events'
import { Suggestion, TranscriptSegment } from '../../shared/types'

type OpenAIOptions = {
  apiKey: string
  model: string
  systemPrompt: string
  baseURL?: string // for custom OpenAI-compatible endpoints (Ollama, LM Studio, Groq, etc.)
  /** Conversation language preference — drives the "match language" rule. */
  language?: 'multi' | 'en' | 'hi'
}

export class OpenAISuggestionClient extends EventEmitter {
  private client: OpenAI
  private inflight: AbortController | null = null

  constructor(private opts: OpenAIOptions) {
    super()
    this.client = new OpenAI({
      apiKey: opts.apiKey || 'not-required',
      baseURL: opts.baseURL
    })
  }

  updateSystemPrompt(prompt: string): void {
    this.opts.systemPrompt = prompt
  }

  async requestSuggestion(transcript: TranscriptSegment[]): Promise<void> {
    if (this.inflight) {
      console.warn('[openai] requestSuggestion called while inflight — ignoring')
      return
    }

    console.log(`[openai] requesting suggestion (transcript segs=${transcript.length})`)
    const recent = transcript.slice(-25)
    const conversation = recent
      .filter((s) => s.isFinal)
      .map(
        (s) =>
          `${s.speaker === 'patient' ? 'PATIENT' : s.speaker === 'sales' ? 'SALES' : 'UNKNOWN'}: ${s.text}`
      )
      .join('\n')

    const suggestionId = `sug-${Date.now()}`
    // Trigger should be the patient utterance that prompted this suggestion —
    // not the last segment overall, which could be a sales (own) utterance.
    const lastPatientFinal = [...recent]
      .reverse()
      .find((s) => s.isFinal && s.speaker === 'patient')
    const triggerId = lastPatientFinal?.id ?? recent[recent.length - 1]?.id ?? ''

    const initial: Suggestion = {
      id: suggestionId,
      text: '',
      triggeredByTranscriptId: triggerId,
      createdAtMs: Date.now(),
      status: 'streaming'
    }
    this.emit('suggestion', initial)

    const controller = new AbortController()
    this.inflight = controller

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.opts.model,
          max_tokens: 400,
          stream: true,
          messages: [
            { role: 'system', content: this.opts.systemPrompt },
            {
              role: 'user',
              content: `Recent conversation (most recent at bottom):\n\n${conversation}\n\nWrite the next reply the user should say to the other person. Rules:\n- Output ONLY the spoken reply, nothing else.\n- No preamble like "You could say..." or "Here's the reply".\n- No meta-commentary, system notes, logs, or markdown formatting.\n- No code blocks or technical output unless the other person literally asked for code.\n- ${languageRule(this.opts.language)}\n- Keep it conversational and concise (1-3 sentences) unless a detailed answer was explicitly asked for.`
            }
          ]
        },
        { signal: controller.signal }
      )

      let accumulated = ''
      for await (const event of stream) {
        const delta = event.choices?.[0]?.delta?.content
        if (delta) {
          accumulated += delta
          this.emit('suggestion', {
            ...initial,
            text: accumulated,
            status: 'streaming'
          })
        }
      }

      this.emit('suggestion', {
        ...initial,
        text: accumulated.trim(),
        status: 'done'
      })
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return
      this.emit('suggestion', {
        ...initial,
        text: `Error: ${err?.message ?? 'unknown'}`,
        status: 'error'
      })
    } finally {
      if (this.inflight === controller) this.inflight = null
    }
  }

  cancelInflight(): void {
    if (this.inflight) {
      this.inflight.abort()
      this.inflight = null
    }
  }
}

/**
 * Same intent as the helper in claude.ts — keep in sync. When the user
 * picked English we explicitly forbid Hindi/Hinglish so the model doesn't
 * mirror code-switching from the other side.
 */
function languageRule(language: 'multi' | 'en' | 'hi' | undefined): string {
  if (language === 'en') {
    return 'Reply in standard English ONLY. Do not use Hindi or Hinglish, even if the other person uses them. Match the tone of the conversation.'
  }
  if (language === 'hi') {
    return 'Reply in Hindi (Devanagari script). Match the tone of the conversation.'
  }
  return 'Match the language and tone of the conversation (Hindi / English / Hinglish).'
}
