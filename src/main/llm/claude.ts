import Anthropic from '@anthropic-ai/sdk'
import { EventEmitter } from 'events'
import { Suggestion, TranscriptSegment } from '../../shared/types'

type ClaudeOptions = {
  apiKey: string
  model: string
  systemPrompt: string
}

export class ClaudeSuggestionClient extends EventEmitter {
  private client: Anthropic
  private inflight: AbortController | null = null

  constructor(private opts: ClaudeOptions) {
    super()
    this.client = new Anthropic({ apiKey: opts.apiKey })
  }

  updateSystemPrompt(prompt: string): void {
    this.opts.systemPrompt = prompt
  }

  async requestSuggestion(transcript: TranscriptSegment[]): Promise<void> {
    // Session gates concurrent calls via its own inflight flag, so we do NOT
    // cancel a streaming reply mid-flight here — that's the bug where a new
    // reply would wipe out the previous one before the user could finish reading.
    if (this.inflight) {
      console.warn('[claude] requestSuggestion called while inflight — ignoring')
      return
    }

    console.log(`[claude] requesting suggestion (transcript segs=${transcript.length})`)
    const recent = transcript.slice(-25)
    const conversation = recent
      .filter((s) => s.isFinal)
      .map((s) => `${s.speaker === 'patient' ? 'PATIENT' : s.speaker === 'sales' ? 'SALES' : 'UNKNOWN'}: ${s.text}`)
      .join('\n')

    const suggestionId = `sug-${Date.now()}`
    const triggerId = recent[recent.length - 1]?.id ?? ''

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
      const stream = await this.client.messages.stream(
        {
          model: this.opts.model,
          max_tokens: 400,
          system: this.opts.systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Recent conversation (most recent at bottom):\n\n${conversation}\n\nWrite the next reply the user should say to the other person. Rules:\n- Output ONLY the spoken reply, nothing else.\n- No preamble like "You could say..." or "Here's the reply".\n- No meta-commentary, system notes, logs, or markdown formatting.\n- No code blocks or technical output unless the other person literally asked for code.\n- Match the language and tone of the conversation (Hindi / English / Hinglish).\n- Keep it conversational and concise (1-3 sentences) unless a detailed answer was explicitly asked for.`
            }
          ]
        },
        { signal: controller.signal }
      )

      let accumulated = ''
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          accumulated += event.delta.text
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
      if (err?.name === 'AbortError') return
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
