import { BrowserWindow } from 'electron'
import { DeepgramStreamingClient } from './stt/deepgram'
import { GroqWhisperClient } from './stt/groq'
import { ClaudeSuggestionClient } from './llm/claude'
import { OpenAISuggestionClient } from './llm/openai'
import { generateSummary } from './llm/summary'
import { getSettings } from './store/settings'
import {
  makeCallId,
  saveTranscript,
  saveSummary,
  saveRecording,
  getRecordingsDir
} from './storage/recordings'
import { TranscriptSegment, Suggestion, CallArtifacts } from '../shared/types'
import { assembleSystemPrompt } from '../shared/prompt'

const SAMPLE_RATE = 16000

export class SessionManager {
  private salesStt: DeepgramStreamingClient | GroqWhisperClient | null = null
  private patientStt: DeepgramStreamingClient | GroqWhisperClient | null = null
  private llm: ClaudeSuggestionClient | OpenAISuggestionClient | null = null
  private transcript: TranscriptSegment[] = []
  private active = false
  private lastSuggestionAt = 0
  // Wall-clock time when the most recent suggestion FINISHED streaming.
  // Cooldown is measured from completion, not from fire — so a slow stream
  // doesn't eat into the "let the user read" pause.
  private lastSuggestionCompletedAt = 0
  // Required quiet time AFTER a suggestion finishes streaming before we'll
  // generate a new one. Combined with `silenceMs`, this puts a practical
  // floor of ~6-7 seconds between suggestions in continuous conversation —
  // enough breathing room to actually read the previous reply.
  private readonly cooldownAfterCompletedMs = 4000
  // Silence-coalesce: wait this many ms after the LAST patient final before
  // firing. Resets on every new final, so rapid-fire questions get bundled
  // into one Claude call. Default mirrors the user-tunable setting
  // (`suggestionTriggerSilenceMs`). 2500ms is a comfortable conversational
  // pause; 1500ms feels snappier, 3000ms is good for slow speakers.
  private readonly defaultSilenceMs = 2500
  private silenceMs = 2500
  private lastPatientFinalAt = 0
  private silenceTimer: NodeJS.Timeout | null = null
  private silenceFireAt = 0
  private suggestionInFlight = false
  private pendingTrigger = false
  private callId: string | null = null
  private callStartedAt = 0
  private recordingPath: string | null = null

  constructor(private getOverlay: () => BrowserWindow | null) {}

  isActive(): boolean {
    return this.active
  }

  getCallId(): string | null {
    return this.callId
  }

  async start(): Promise<{ ok: boolean; error?: string; callId?: string }> {
    if (this.active) return { ok: true, callId: this.callId ?? undefined }

    const settings = getSettings()
    if (settings.sttProvider === 'groq') {
      if (!settings.groqApiKey) {
        return { ok: false, error: 'Groq API key missing. Open Settings.' }
      }
    } else {
      if (!settings.deepgramApiKey) {
        return { ok: false, error: 'Deepgram API key missing. Open Settings.' }
      }
    }
    if (settings.featureLiveSuggestions) {
      if (settings.llmProvider === 'custom') {
        if (!settings.customBaseUrl) {
          return {
            ok: false,
            error: 'Custom endpoint Base URL missing (required for live suggestions).'
          }
        }
        // customApiKey is optional — Ollama doesn't need one
      } else {
        const providerKey =
          settings.llmProvider === 'openai' ? settings.openaiApiKey : settings.anthropicApiKey
        if (!providerKey) {
          const which = settings.llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'
          return {
            ok: false,
            error: `${which} API key missing (required for live suggestions).`
          }
        }
      }
    }

    this.transcript = []
    this.lastSuggestionAt = 0
    this.lastSuggestionCompletedAt = 0
    this.lastPatientFinalAt = 0
    this.suggestionInFlight = false
    this.pendingTrigger = false
    // Pull silence window from settings (user-tunable). Fall back to default
    // if not set or out of plausible range.
    const configuredMs = settings.suggestionTriggerSilenceMs
    this.silenceMs =
      typeof configuredMs === 'number' && configuredMs >= 200 && configuredMs <= 10_000
        ? configuredMs
        : this.defaultSilenceMs
    this.cancelSilenceTimer()
    this.callId = makeCallId()
    this.callStartedAt = Date.now()
    this.recordingPath = null
    console.log(`[session] starting call ${this.callId}`)
    console.log(`[session] features:`, {
      liveSuggestions: settings.featureLiveSuggestions,
      record: settings.featureRecordAudio,
      transcript: settings.featureSaveTranscript,
      summary: settings.featureGenerateSummary
    })

    if (settings.sttProvider === 'groq') {
      this.salesStt = new GroqWhisperClient({
        apiKey: settings.groqApiKey,
        language: settings.language,
        sampleRate: SAMPLE_RATE,
        speaker: 'sales'
      })
      this.patientStt = new GroqWhisperClient({
        apiKey: settings.groqApiKey,
        language: settings.language,
        sampleRate: SAMPLE_RATE,
        speaker: 'patient'
      })
    } else {
      this.salesStt = new DeepgramStreamingClient({
        apiKey: settings.deepgramApiKey,
        language: settings.language,
        sampleRate: SAMPLE_RATE,
        speaker: 'sales'
      })
      this.patientStt = new DeepgramStreamingClient({
        apiKey: settings.deepgramApiKey,
        language: settings.language,
        sampleRate: SAMPLE_RATE,
        speaker: 'patient'
      })
    }
    console.log(`[session] stt provider: ${settings.sttProvider}`)

    if (settings.featureLiveSuggestions) {
      // Substitute {{...}} placeholders + append patient context. Done here
      // (at session start) rather than per-suggestion so a typo in the
      // template fails loud once, not on every fire.
      const finalSystemPrompt = assembleSystemPrompt({
        template: settings.systemPrompt,
        vars: settings.dynamicVariables ?? {},
        patientContext: settings.patientContext
      })
      if (settings.llmProvider === 'custom') {
        this.llm = new OpenAISuggestionClient({
          apiKey: settings.customApiKey,
          model: settings.customModel,
          systemPrompt: finalSystemPrompt,
          baseURL: settings.customBaseUrl,
          language: settings.language
        })
      } else if (settings.llmProvider === 'openai') {
        this.llm = new OpenAISuggestionClient({
          apiKey: settings.openaiApiKey,
          model: settings.openaiModel,
          systemPrompt: finalSystemPrompt,
          language: settings.language
        })
      } else {
        this.llm = new ClaudeSuggestionClient({
          apiKey: settings.anthropicApiKey,
          model: settings.llmModel,
          systemPrompt: finalSystemPrompt,
          language: settings.language
        })
      }
      const usedModel =
        settings.llmProvider === 'custom'
          ? `${settings.customModel} @ ${settings.customBaseUrl}`
          : settings.llmProvider === 'openai'
            ? settings.openaiModel
            : settings.llmModel
      console.log(`[session] llm provider: ${settings.llmProvider}, model: ${usedModel}`)
      this.llm.on('suggestion', (sug: Suggestion) => {
        this.broadcast('suggestion:update', sug)
        if (sug.status === 'done' || sug.status === 'error') {
          this.suggestionInFlight = false
          this.lastSuggestionCompletedAt = Date.now()
          if (this.pendingTrigger) {
            this.pendingTrigger = false
            // Don't fire instantly — go through the same gating so the
            // cooldown-after-completion still applies.
            this.maybeTriggerSuggestion()
          }
        }
      })
    }

    this.wireStt(this.salesStt, 'sales')
    this.wireStt(this.patientStt, 'patient')

    try {
      await Promise.all([this.salesStt.start(), this.patientStt.start()])
      this.active = true
      this.broadcast('session:status', { active: true, callId: this.callId })
      return { ok: true, callId: this.callId }
    } catch (err: any) {
      this.stop()
      return { ok: false, error: err?.message ?? 'failed to start' }
    }
  }

  private wireStt(
    stt: DeepgramStreamingClient | GroqWhisperClient,
    speaker: 'sales' | 'patient'
  ): void {
    stt.on('transcript', (seg: TranscriptSegment) => {
      if (seg.isFinal) {
        this.transcript.push(seg)
        if (seg.speaker === 'patient') {
          this.lastPatientFinalAt = Date.now()
          console.log(
            `[session] patient FINAL: "${seg.text}" — debouncing for ${this.silenceMs}ms`
          )
          // Coalesce rapid-fire questions: every new final RESETS the silence
          // timer, so we wait until the speaker actually pauses before firing.
          this.scheduleSilenceTimer(this.silenceMs)
        }
        this.broadcast('transcript:update', seg)
      } else {
        this.broadcast('transcript:update', seg)
      }
    })

    stt.on('utterance-end', () => {
      // Intentionally a no-op now. Earlier we shortened the silence timer
      // to 300ms here — but Deepgram fires utterance-end after every
      // short fragment, which made the assistant generate a fresh
      // suggestion every 2-3 seconds. Pure silence-coalesce (full
      // `silenceMs` wait, reset on each new final) feels much calmer and
      // still responds within ~2s of a real conversational pause.
      if (speaker !== 'patient') return
      // eslint-disable-next-line no-console
      console.log('[session] patient utterance-end (ignored — waiting for silence)')
    })

    stt.on('error', (err: any) => {
      this.broadcast('session:status', {
        active: false,
        error: `${speaker} stt: ${err?.message ?? 'error'}`
      })
    })
  }

  private cancelSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    this.silenceFireAt = 0
  }

  /**
   * (Re)schedule the silence timer to fire `delayMs` from now. Replaces any
   * existing schedule.
   */
  private scheduleSilenceTimer(delayMs: number): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer)
    this.silenceFireAt = Date.now() + delayMs
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null
      this.silenceFireAt = 0
      console.log('[session] silence timer fired → maybeTrigger')
      this.maybeTriggerSuggestion()
    }, delayMs)
  }

  /**
   * Trigger a suggestion if there's fresh patient content since the last one.
   * If a suggestion is currently streaming, queue exactly one pending trigger.
   */
  private maybeTriggerSuggestion(): void {
    if (!this.llm) {
      console.log('[session] maybeTrigger skip: no llm (live suggestions disabled?)')
      return
    }
    if (this.lastPatientFinalAt <= this.lastSuggestionAt) {
      console.log(
        `[session] maybeTrigger skip: no new patient content (lastPatientFinalAt=${this.lastPatientFinalAt}, lastSuggestionAt=${this.lastSuggestionAt})`
      )
      return
    }

    if (this.suggestionInFlight) {
      console.log('[session] maybeTrigger queue: suggestion in flight, marking pending')
      this.pendingTrigger = true
      return
    }

    // Cooldown: measured from the moment the previous suggestion FINISHED
    // streaming (not from when it started). This gives the user a real
    // "read it before a new one shows up" pause regardless of how slow the
    // LLM streamed back.
    const now = Date.now()
    const sinceCompleted = now - this.lastSuggestionCompletedAt
    if (this.lastSuggestionCompletedAt > 0 && sinceCompleted < this.cooldownAfterCompletedMs) {
      const wait = this.cooldownAfterCompletedMs - sinceCompleted
      console.log(`[session] maybeTrigger defer: cooldown, retry in ${wait}ms`)
      setTimeout(() => this.maybeTriggerSuggestion(), wait)
      return
    }

    console.log('[session] maybeTrigger FIRE: calling llm.requestSuggestion')
    this.lastSuggestionAt = now
    this.suggestionInFlight = true
    void this.llm.requestSuggestion(this.transcript)
  }

  pushSystemAudio(chunk: Buffer): void {
    this.patientStt?.sendAudio(chunk)
  }

  pushMicAudio(chunk: Buffer): void {
    this.salesStt?.sendAudio(chunk)
  }

  /**
   * Manual trigger from the Regenerate button. Unlike auto-trigger, this
   * cancels anything currently streaming and starts fresh — the user is
   * explicitly asking for a new reply right now.
   */
  requestSuggestion(): void {
    if (!this.llm) return
    console.log('[session] manual Regenerate — cancelling inflight, firing fresh')
    this.llm.cancelInflight()
    this.suggestionInFlight = false
    this.pendingTrigger = false
    this.cancelSilenceTimer()
    this.lastSuggestionAt = Date.now()
    this.suggestionInFlight = true
    void this.llm.requestSuggestion(this.transcript)
  }

  /**
   * Save a recording blob from the renderer for the current/just-ended call.
   * Returns the saved file path.
   */
  async saveRecordingBlob(data: Buffer, mimeType: string): Promise<string | null> {
    if (!this.callId) {
      console.warn('[session] saveRecordingBlob called without active callId')
      return null
    }
    const path = await saveRecording(this.callId, data, mimeType)
    this.recordingPath = path
    console.log(`[session] recording saved: ${path} (${data.length} bytes)`)
    return path
  }

  /**
   * Finalize the call: save transcript / generate summary based on settings.
   * Returns CallArtifacts describing what was saved.
   */
  async finalize(): Promise<CallArtifacts | null> {
    if (!this.callId) return null
    const settings = getSettings()
    const callId = this.callId
    const startedAt = this.callStartedAt
    const endedAt = Date.now()

    const artifacts: CallArtifacts = {
      callId,
      startedAt,
      endedAt,
      recordingsDir: getRecordingsDir(),
      recordingPath: this.recordingPath ?? undefined
    }

    console.log(
      `[session] finalize ${callId} — transcript segs: ${this.transcript.length}, recording: ${!!this.recordingPath}`
    )

    if (settings.featureSaveTranscript) {
      if (this.transcript.length === 0) {
        console.warn('[session] transcript save skipped — no segments captured')
      } else {
        try {
          const paths = await saveTranscript(
            callId,
            this.transcript,
            settings.speakerLabelMe,
            settings.speakerLabelThem
          )
          artifacts.transcriptTxtPath = paths.txt
          if (paths.md) artifacts.transcriptMdPath = paths.md
          console.log(`[session] transcript saved: ${paths.txt}${paths.md ? ` + ${paths.md}` : ''}`)
        } catch (err) {
          console.error('[session] save transcript failed', err)
        }
      }
    }

    if (settings.featureGenerateSummary) {
      const summaryKey =
        settings.llmProvider === 'custom'
          ? settings.customApiKey
          : settings.llmProvider === 'openai'
            ? settings.openaiApiKey
            : settings.anthropicApiKey
      const summaryModel =
        settings.llmProvider === 'custom'
          ? settings.customModel
          : settings.llmProvider === 'openai'
            ? settings.openaiModel
            : settings.llmModel
      const summaryBaseUrl =
        settings.llmProvider === 'custom' ? settings.customBaseUrl : undefined
      const keyMissing = settings.llmProvider === 'custom' ? !settings.customBaseUrl : !summaryKey
      if (keyMissing) {
        const which =
          settings.llmProvider === 'custom'
            ? 'custom endpoint URL'
            : `${settings.llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API key`
        console.warn(`[session] summary skipped — no ${which}`)
      } else if (this.transcript.length === 0) {
        console.warn('[session] summary skipped — no transcript')
      } else {
        try {
          console.log(`[session] generating summary via ${settings.llmProvider}…`)
          const summaryMd = await generateSummary({
            provider: settings.llmProvider,
            apiKey: summaryKey,
            model: summaryModel,
            baseURL: summaryBaseUrl,
            transcript: this.transcript,
            meLabel: settings.speakerLabelMe,
            themLabel: settings.speakerLabelThem,
            language: settings.language
          })
          const paths = await saveSummary(callId, summaryMd)
          artifacts.summaryTxtPath = paths.txt
          if (paths.md) artifacts.summaryMdPath = paths.md
          console.log(`[session] summary saved: ${paths.txt}${paths.md ? ` + ${paths.md}` : ''}`)
        } catch (err) {
          console.error('[session] generate summary failed', err)
        }
      }
    }

    return artifacts
  }

  stop(): void {
    this.salesStt?.stop()
    this.patientStt?.stop()
    this.llm?.cancelInflight()
    this.cancelSilenceTimer()
    this.suggestionInFlight = false
    this.pendingTrigger = false
    this.salesStt = null
    this.patientStt = null
    this.llm = null
    this.active = false
    this.broadcast('session:status', { active: false })
  }

  private broadcast(channel: string, payload: unknown): void {
    const win = this.getOverlay()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
