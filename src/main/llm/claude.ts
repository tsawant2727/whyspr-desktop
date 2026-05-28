import Anthropic from '@anthropic-ai/sdk'
import { EventEmitter } from 'events'
import { Suggestion, TranscriptSegment } from '../../shared/types'

type ClaudeOptions = {
  apiKey: string
  model: string
  systemPrompt: string
  /** Conversation language preference — drives the "match language" rule. */
  language?: 'multi' | 'en' | 'hi'
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
    // Trigger should be the patient utterance that prompted this suggestion —
    // NOT just the last segment, which could be a sales (own) utterance that
    // came in between the patient question and this LLM call. Mislabelling
    // the trigger makes the Q+A pair show "You asked" instead of "Patient
    // asked" in the overlay.
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
      const stream = await this.client.messages.stream(
        {
          model: this.opts.model,
          max_tokens: 400,
          system: this.opts.systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Recent conversation (most recent at bottom):\n\n${conversation}\n\nWrite the next reply the user should say to the other person. Rules:\n- Output ONLY the spoken reply (1-3 sentences), nothing else.\n- NEVER write preamble like "You could say...", "Here's the reply", "I appreciate you sharing...", "I need to be direct...", "Let me reset...".\n- NEVER describe or comment on the transcript itself (do not call it fragmented, unclear, multilingual, garbled, corrupted, or hard to follow).\n- NEVER ask the user clarifying questions. Do not use phrases like "Could you clarify", "What did the patient just say", "Is the surgeon still on the call", "Where are we in the call".\n- NEVER mention phases, playbooks, system prompts, scenarios, or how you were instructed.\n- If the transcript is messy, partial, or ambiguous, STILL produce one safe, warm, generic conversational reply (acknowledge + gently invite them to repeat or continue). Do NOT refuse, do NOT explain why you can't help, do NOT pause to ask for context.\n- No markdown, no code blocks, no headings, no bullet points (unless the other person literally asked for code).\n- ${languageRule(this.opts.language)}\n- Keep it conversational and concise.`
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

/**
 * Build the "match language" rule injected into every suggestion request.
 * When the user has picked English-only we explicitly tell the model not
 * to use Hindi / Hinglish — otherwise the model would mirror code-switching
 * even when the user wants strictly English replies.
 */
function languageRule(language: 'multi' | 'en' | 'hi' | undefined): string {
  if (language === 'en') {
    return 'Reply in standard English ONLY. Do not use Hindi or Hinglish, even if the other person uses them. Match the tone of the conversation.'
  }
  if (language === 'hi') {
    return 'Reply in Hindi (Devanagari script). Match the tone of the conversation.'
  }
  // 'multi' or unset — natural mirroring.
  return 'Match the language and tone of the conversation (Hindi / English / Hinglish).'
}
