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

const SAMPLE_RATE = 16000

export class SessionManager {
  private salesStt: DeepgramStreamingClient | GroqWhisperClient | null = null
  private patientStt: DeepgramStreamingClient | GroqWhisperClient | null = null
  private llm: ClaudeSuggestionClient | OpenAISuggestionClient | null = null
  private transcript: TranscriptSegment[] = []
  private active = false
  private lastSuggestionAt = 0
  private readonly minSuggestionGapMs = 600
  // Fallback timer in case Deepgram drops the utterance-end event after a
  // patient final transcript — fires the suggestion anyway.
  private readonly patientFinalFallbackMs = 1500
  private lastPatientFinalAt = 0
  private patientFallbackTimer: NodeJS.Timeout | null = null
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
    this.lastPatientFinalAt = 0
    this.suggestionInFlight = false
    this.pendingTrigger = false
    if (this.patientFallbackTimer) {
      clearTimeout(this.patientFallbackTimer)
      this.patientFallbackTimer = null
    }
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
      if (settings.llmProvider === 'custom') {
        this.llm = new OpenAISuggestionClient({
          apiKey: settings.customApiKey,
          model: settings.customModel,
          systemPrompt: settings.systemPrompt,
          baseURL: settings.customBaseUrl
        })
      } else if (settings.llmProvider === 'openai') {
        this.llm = new OpenAISuggestionClient({
          apiKey: settings.openaiApiKey,
          model: settings.openaiModel,
          systemPrompt: settings.systemPrompt
        })
      } else {
        this.llm = new ClaudeSuggestionClient({
          apiKey: settings.anthropicApiKey,
          model: settings.llmModel,
          systemPrompt: settings.systemPrompt
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
          if (this.pendingTrigger) {
            this.pendingTrigger = false
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
          console.log(`[session] patient FINAL: "${seg.text}" — arming fallback timer`)
          if (this.patientFallbackTimer) clearTimeout(this.patientFallbackTimer)
          this.patientFallbackTimer = setTimeout(() => {
            this.patientFallbackTimer = null
            console.log('[session] fallback timer fired (utterance-end missed)')
            this.maybeTriggerSuggestion()
          }, this.patientFinalFallbackMs)
        }
        this.broadcast('transcript:update', seg)
      } else {
        this.broadcast('transcript:update', seg)
      }
    })

    stt.on('utterance-end', () => {
      if (speaker !== 'patient') return
      if (this.patientFallbackTimer) {
        clearTimeout(this.patientFallbackTimer)
        this.patientFallbackTimer = null
      }
      console.log('[session] patient utterance-end → maybeTrigger')
      this.maybeTriggerSuggestion()
    })

    stt.on('error', (err: any) => {
      this.broadcast('session:status', {
        active: false,
        error: `${speaker} stt: ${err?.message ?? 'error'}`
      })
    })
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

    const now = Date.now()
    const elapsed = now - this.lastSuggestionAt
    if (elapsed < this.minSuggestionGapMs) {
      const wait = this.minSuggestionGapMs - elapsed
      console.log(`[session] maybeTrigger defer: rate-limit, retry in ${wait}ms`)
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
    if (this.patientFallbackTimer) {
      clearTimeout(this.patientFallbackTimer)
      this.patientFallbackTimer = null
    }
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
            themLabel: settings.speakerLabelThem
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
