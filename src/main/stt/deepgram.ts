import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk'
import { EventEmitter } from 'events'
import { TranscriptSegment } from '../../shared/types'

type DeepgramOptions = {
  apiKey: string
  language: 'multi' | 'en' | 'hi'
  sampleRate: number
  speaker: 'sales' | 'patient'
}

export class DeepgramStreamingClient extends EventEmitter {
  private connection: LiveClient | null = null
  private isReady = false

  constructor(private opts: DeepgramOptions) {
    super()
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const deepgram = createClient(this.opts.apiKey)
        const langConfig =
          this.opts.language === 'multi'
            ? { language: 'multi', model: 'nova-3' }
            : this.opts.language === 'hi'
              ? { language: 'hi', model: 'nova-2' }
              : { language: 'en-IN', model: 'nova-3' }

        this.connection = deepgram.listen.live({
          ...langConfig,
          encoding: 'linear16',
          sample_rate: this.opts.sampleRate,
          channels: 1,
          interim_results: true,
          smart_format: true,
          punctuate: true,
          endpointing: 500,
          utterance_end_ms: 1000,
          vad_events: true
        })

        this.connection.on(LiveTranscriptionEvents.Open, () => {
          this.isReady = true
          this.emit('open')
          resolve()
        })

        this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
          const alt = data?.channel?.alternatives?.[0]
          if (!alt) return
          const text = alt.transcript as string
          if (!text || !text.trim()) return

          const segment: TranscriptSegment = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            speaker: this.opts.speaker,
            text,
            isFinal: !!data.is_final,
            timestampMs: Date.now()
          }
          this.emit('transcript', segment)
        })

        this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
          this.emit('utterance-end')
        })

        this.connection.on(LiveTranscriptionEvents.Error, (err: any) => {
          this.emit('error', err)
          if (!this.isReady) reject(err)
        })

        this.connection.on(LiveTranscriptionEvents.Close, () => {
          this.isReady = false
          this.emit('close')
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  sendAudio(chunk: Buffer): void {
    if (this.isReady && this.connection) {
      this.connection.send(chunk)
    }
  }

  stop(): void {
    if (this.connection) {
      try {
        this.connection.requestClose()
      } catch {
        // ignore
      }
      this.connection = null
      this.isReady = false
    }
  }
}
