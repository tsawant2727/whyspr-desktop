const TARGET_SAMPLE_RATE = 16000

export type AudioCaptureHandle = {
  stop: () => Promise<{ recording?: Blob }>
}

export type AudioCaptureCallbacks = {
  onSystemChunk: (chunk: ArrayBuffer) => void // patient (other side of call)
  onMicChunk: (chunk: ArrayBuffer) => void // sales rep (me)
  recordAudio?: boolean
}

/**
 * Captures system audio (other side voice) and microphone audio (your voice)
 * as SEPARATE STT streams. Optionally also records a MIXED Opus/WebM blob
 * for local storage when recordAudio=true.
 */
export async function startAudioCapture(
  callbacks: AudioCaptureCallbacks
): Promise<AudioCaptureHandle> {
  const systemStream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true
  })

  systemStream.getVideoTracks().forEach((t) => t.stop())

  const sysTracks = systemStream.getAudioTracks()
  if (sysTracks.length === 0) {
    systemStream.getTracks().forEach((t) => t.stop())
    throw new Error(
      'System audio not captured. macOS: grant Screen Recording permission in System Settings → Privacy & Security, then quit and relaunch the app. Windows: should work automatically — try restarting.'
    )
  }

  let micStream: MediaStream
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
  } catch {
    systemStream.getTracks().forEach((t) => t.stop())
    throw new Error(
      'Microphone access denied. Grant mic permission in System Settings → Privacy & Security → Microphone, then restart the app.'
    )
  }

  const audioCtx = new AudioContext({ sampleRate: 48000 })
  const ratio = audioCtx.sampleRate / TARGET_SAMPLE_RATE

  const sysProcessor = buildProcessor(audioCtx, sysTracks[0], ratio, callbacks.onSystemChunk)
  const micProcessor = buildProcessor(
    audioCtx,
    micStream.getAudioTracks()[0],
    ratio,
    callbacks.onMicChunk
  )

  // Optional recording: mix mic + system into a single MediaStream and record
  let recorder: MediaRecorder | null = null
  const recordingChunks: Blob[] = []
  let recordedMimeType = 'audio/webm'

  if (callbacks.recordAudio) {
    try {
      const sysSourceForRec = audioCtx.createMediaStreamSource(
        new MediaStream([sysTracks[0]])
      )
      const micSourceForRec = audioCtx.createMediaStreamSource(
        new MediaStream([micStream.getAudioTracks()[0]])
      )
      const mixer = audioCtx.createGain()
      const sysGain = audioCtx.createGain()
      sysGain.gain.value = 1.0
      const micGain = audioCtx.createGain()
      micGain.gain.value = 1.0
      sysSourceForRec.connect(sysGain).connect(mixer)
      micSourceForRec.connect(micGain).connect(mixer)

      const dest = audioCtx.createMediaStreamDestination()
      mixer.connect(dest)

      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ]
      const supported = candidates.find((c) => MediaRecorder.isTypeSupported(c))
      if (!supported) {
        console.warn('[recording] no supported MediaRecorder mimeType — recording disabled')
      } else {
        recordedMimeType = supported
        recorder = new MediaRecorder(dest.stream, {
          mimeType: supported,
          audioBitsPerSecond: 64000
        })
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordingChunks.push(e.data)
        }
        recorder.start(1000) // emit chunks every 1s
      }
    } catch (err) {
      console.error('[recording] setup failed', err)
    }
  }

  return {
    stop: async () => {
      const recordingBlob: Blob | undefined = recorder
        ? await new Promise<Blob | undefined>((resolve) => {
            const r = recorder!
            r.onstop = () => {
              if (recordingChunks.length === 0) {
                resolve(undefined)
                return
              }
              resolve(new Blob(recordingChunks, { type: recordedMimeType }))
            }
            try {
              if (r.state !== 'inactive') r.stop()
              else resolve(undefined)
            } catch {
              resolve(undefined)
            }
          })
        : undefined

      try {
        sysProcessor.disconnect()
        micProcessor.disconnect()
        audioCtx.close()
      } catch {
        /* ignore */
      }
      systemStream.getTracks().forEach((t) => t.stop())
      micStream.getTracks().forEach((t) => t.stop())

      return { recording: recordingBlob }
    }
  }
}

function buildProcessor(
  ctx: AudioContext,
  track: MediaStreamTrack,
  ratio: number,
  onChunk: (chunk: ArrayBuffer) => void
): { disconnect: () => void } {
  const source = ctx.createMediaStreamSource(new MediaStream([track]))
  const bufferSize = 4096
  const processor = ctx.createScriptProcessor(bufferSize, 1, 1)
  source.connect(processor)
  const sink = ctx.createGain()
  sink.gain.value = 0
  processor.connect(sink).connect(ctx.destination)

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    const outLength = Math.floor(input.length / ratio)
    const pcm16 = new Int16Array(outLength)
    for (let i = 0; i < outLength; i++) {
      const srcIdx = i * ratio
      const idx0 = Math.floor(srcIdx)
      const idx1 = Math.min(idx0 + 1, input.length - 1)
      const frac = srcIdx - idx0
      const sample = input[idx0] * (1 - frac) + input[idx1] * frac
      const clamped = Math.max(-1, Math.min(1, sample))
      pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    }
    onChunk(pcm16.buffer)
  }

  return {
    disconnect: () => {
      try {
        processor.disconnect()
        source.disconnect()
        sink.disconnect()
      } catch {
        /* ignore */
      }
    }
  }
}
