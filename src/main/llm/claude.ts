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
    this.cancelInflight()

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
          // Generous limit so technical/coding/system-design answers can stream
          // fully. For short conversational use cases the model stops earlier.
          max_tokens: 1200,
          system: this.opts.systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Recent conversation (most recent at bottom):\n\n${conversation}\n\nBased on the last thing the other person said, give the best response to speak next. Output only the response itself — no preamble, no meta-commentary. Adapt length to the question (short for chitchat, long for technical/coding questions).`
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
