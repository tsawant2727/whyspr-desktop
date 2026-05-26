import { BrowserWindow } from 'electron'
import { DeepgramStreamingClient } from './stt/deepgram'
import { ClaudeSuggestionClient } from './llm/claude'
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
  private salesStt: DeepgramStreamingClient | null = null
  private patientStt: DeepgramStreamingClient | null = null
  private llm: ClaudeSuggestionClient | null = null
  private transcript: TranscriptSegment[] = []
  private active = false
  private lastSuggestionAt = 0
  private readonly minSuggestionGapMs = 2000
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
    if (!settings.deepgramApiKey) {
      return { ok: false, error: 'Deepgram API key missing. Open Settings.' }
    }
    if (settings.featureLiveSuggestions && !settings.anthropicApiKey) {
      return { ok: false, error: 'Anthropic API key missing (required for live suggestions).' }
    }

    this.transcript = []
    this.lastSuggestionAt = 0
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

    if (settings.featureLiveSuggestions) {
      this.llm = new ClaudeSuggestionClient({
        apiKey: settings.anthropicApiKey,
        model: settings.llmModel,
        systemPrompt: settings.systemPrompt
      })
      this.llm.on('suggestion', (sug: Suggestion) => {
        this.broadcast('suggestion:update', sug)
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

  private wireStt(stt: DeepgramStreamingClient, speaker: 'sales' | 'patient'): void {
    stt.on('transcript', (seg: TranscriptSegment) => {
      if (seg.isFinal) {
        this.transcript.push(seg)
        this.broadcast('transcript:update', seg)
      } else {
        this.broadcast('transcript:update', seg)
      }
    })

    stt.on('utterance-end', () => {
      if (speaker !== 'patient') return
      if (!this.llm) return
      const now = Date.now()
      if (now - this.lastSuggestionAt < this.minSuggestionGapMs) return
      const lastFinal = [...this.transcript].reverse().find((s) => s.isFinal)
      if (!lastFinal || lastFinal.speaker !== 'patient') return
      this.lastSuggestionAt = now
      void this.llm.requestSuggestion(this.transcript)
    })

    stt.on('error', (err: any) => {
      this.broadcast('session:status', {
        active: false,
        error: `${speaker} stt: ${err?.message ?? 'error'}`
      })
    })
  }

  pushSystemAudio(chunk: Buffer): void {
    this.patientStt?.sendAudio(chunk)
  }

  pushMicAudio(chunk: Buffer): void {
    this.salesStt?.sendAudio(chunk)
  }

  requestSuggestion(): void {
    if (this.llm) {
      this.lastSuggestionAt = Date.now()
      void this.llm.requestSuggestion(this.transcript)
    }
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
          artifacts.transcriptMdPath = paths.md
          console.log(`[session] transcript saved: ${paths.txt} + ${paths.md}`)
        } catch (err) {
          console.error('[session] save transcript failed', err)
        }
      }
    }

    if (settings.featureGenerateSummary) {
      if (!settings.anthropicApiKey) {
        console.warn('[session] summary skipped — no Anthropic API key')
      } else if (this.transcript.length === 0) {
        console.warn('[session] summary skipped — no transcript')
      } else {
        try {
          console.log('[session] generating summary via Claude…')
          const summaryMd = await generateSummary({
            apiKey: settings.anthropicApiKey,
            model: settings.llmModel,
            transcript: this.transcript,
            meLabel: settings.speakerLabelMe,
            themLabel: settings.speakerLabelThem
          })
          const paths = await saveSummary(callId, summaryMd)
          artifacts.summaryTxtPath = paths.txt
          artifacts.summaryMdPath = paths.md
          console.log(`[session] summary saved: ${paths.txt} + ${paths.md}`)
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
