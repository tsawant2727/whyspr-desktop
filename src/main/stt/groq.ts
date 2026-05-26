import OpenAI, { toFile } from 'openai'
import { EventEmitter } from 'events'
import { TranscriptSegment } from '../../shared/types'

type GroqOptions = {
  apiKey: string
  language: 'multi' | 'en' | 'hi'
  sampleRate: number
  speaker: 'sales' | 'patient'
}

// Groq's transcription API is batch (no WebSocket streaming). We buffer PCM
// audio, slice it every CHUNK_INTERVAL_MS, and send each slice to Whisper.
// Each slice produces one "final" transcript segment. Silence-only slices
// are skipped to save credits.
const CHUNK_INTERVAL_MS = 2500
const SILENCE_RMS_THRESHOLD = 350 // empirically tuned for 16-bit PCM
const UTTERANCE_END_SILENCE_MS = 1200 // after this much silence, fire utterance-end

export class GroqWhisperClient extends EventEmitter {
  private client: OpenAI | null = null
  private buffer: Buffer[] = []
  private chunkTimer: NodeJS.Timeout | null = null
  private silenceTimer: NodeJS.Timeout | null = null
  private isReady = false
  private stopped = false
  private inflight = 0
  private lastAudioAtMs = 0

  constructor(private opts: GroqOptions) {
    super()
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.opts.apiKey) {
          reject(new Error('Groq API key missing'))
          return
        }
        this.client = new OpenAI({
          apiKey: this.opts.apiKey,
          baseURL: 'https://api.groq.com/openai/v1'
        })
        this.isReady = true
        this.stopped = false
        this.scheduleChunk()
        this.emit('open')
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  }

  sendAudio(chunk: Buffer): void {
    if (!this.isReady || this.stopped) return
    this.buffer.push(chunk)

    // Crude voice activity detection: compute RMS of this chunk.
    const rms = computeRms(chunk)
    if (rms > SILENCE_RMS_THRESHOLD) {
      this.lastAudioAtMs = Date.now()
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer)
        this.silenceTimer = null
      }
    } else if (!this.silenceTimer && this.lastAudioAtMs > 0) {
      // First silence after speech — arm utterance-end timer.
      this.silenceTimer = setTimeout(() => {
        this.silenceTimer = null
        this.emit('utterance-end')
      }, UTTERANCE_END_SILENCE_MS)
    }
  }

  private scheduleChunk(): void {
    if (this.stopped) return
    this.chunkTimer = setTimeout(() => {
      void this.flushChunk()
      this.scheduleChunk()
    }, CHUNK_INTERVAL_MS)
  }

  private async flushChunk(): Promise<void> {
    if (this.buffer.length === 0) return
    const pcm = Buffer.concat(this.buffer)
    this.buffer = []

    // Skip silent chunks — saves Groq credits + avoids hallucinations on noise.
    if (computeRms(pcm) < SILENCE_RMS_THRESHOLD) return

    if (!this.client) return
    this.inflight++
    try {
      const wav = wrapPcmInWav(pcm, this.opts.sampleRate)
      const file = await toFile(wav, 'chunk.wav', { type: 'audio/wav' })

      const params: Record<string, unknown> = {
        file,
        model: 'whisper-large-v3-turbo',
        response_format: 'json',
        temperature: 0
      }
      if (this.opts.language !== 'multi') {
        params.language = this.opts.language
      }

      const result = (await this.client.audio.transcriptions.create(
        params as Parameters<typeof this.client.audio.transcriptions.create>[0]
      )) as { text?: string }

      const text = (result?.text ?? '').trim()
      if (!text) return

      const segment: TranscriptSegment = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        speaker: this.opts.speaker,
        text,
        isFinal: true,
        timestampMs: Date.now()
      }
      this.emit('transcript', segment)
    } catch (err: any) {
      console.error(`[groq:${this.opts.speaker}] transcription error:`, err?.message ?? err)
      this.emit('error', err)
    } finally {
      this.inflight--
    }
  }

  stop(): void {
    this.stopped = true
    this.isReady = false
    if (this.chunkTimer) {
      clearTimeout(this.chunkTimer)
      this.chunkTimer = null
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    this.buffer = []
    this.emit('close')
  }
}

function computeRms(pcm: Buffer): number {
  if (pcm.length < 2) return 0
  let sum = 0
  const samples = pcm.length / 2
  for (let i = 0; i < pcm.length; i += 2) {
    const s = pcm.readInt16LE(i)
    sum += s * s
  }
  return Math.sqrt(sum / samples)
}

/**
 * Wrap raw 16-bit mono PCM in a WAV container so Whisper accepts it.
 */
function wrapPcmInWav(pcm: Buffer, sampleRate: number): Buffer {
  const byteRate = sampleRate * 2 // mono, 16-bit
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // PCM format
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
