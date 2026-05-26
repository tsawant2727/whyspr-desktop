import OpenAI from 'openai'
import { EventEmitter } from 'events'
import { Suggestion, TranscriptSegment } from '../../shared/types'

type OpenAIOptions = {
  apiKey: string
  model: string
  systemPrompt: string
}

export class OpenAISuggestionClient extends EventEmitter {
  private client: OpenAI
  private inflight: AbortController | null = null

  constructor(private opts: OpenAIOptions) {
    super()
    this.client = new OpenAI({ apiKey: opts.apiKey })
  }

  updateSystemPrompt(prompt: string): void {
    this.opts.systemPrompt = prompt
  }

  async requestSuggestion(transcript: TranscriptSegment[]): Promise<void> {
    if (this.inflight) {
      console.warn('[openai] requestSuggestion called while inflight — ignoring')
      return
    }

    const recent = transcript.slice(-25)
    const conversation = recent
      .filter((s) => s.isFinal)
      .map(
        (s) =>
          `${s.speaker === 'patient' ? 'PATIENT' : s.speaker === 'sales' ? 'SALES' : 'UNKNOWN'}: ${s.text}`
      )
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
      const stream = await this.client.chat.completions.create(
        {
          model: this.opts.model,
          max_tokens: 1200,
          stream: true,
          messages: [
            { role: 'system', content: this.opts.systemPrompt },
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
