const TARGET_SAMPLE_RATE = 16000

export type AudioCaptureHandle = {
  stop: () => Promise<{ recording?: Blob }>
}

export type AudioCaptureCallbacks = {
  onSystemChunk: (chunk: ArrayBuffer) => void // patient (other side of call)
  onMicChunk: (chunk: ArrayBuffer) => void // sales rep (me)
  recordAudio?: boolean
  recordVideo?: boolean // capture screen + audio together
}

/**
 * Captures system audio (other side voice) and microphone audio (your voice)
 * as SEPARATE STT streams. Optionally also records a MIXED blob for local
 * storage — audio-only WebM/Opus by default, or video+audio WebM when
 * recordVideo=true.
 */
export async function startAudioCapture(
  callbacks: AudioCaptureCallbacks
): Promise<AudioCaptureHandle> {
  const wantVideo = !!callbacks.recordVideo
  const systemStream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true
  })

  if (!wantVideo) {
    systemStream.getVideoTracks().forEach((t) => t.stop())
  }

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
        // Echo cancellation removes audio coming back through the mic that
        // matches what's playing on the speakers — fixes the "patient's
        // voice leaks into the 'You' transcript" bug when the user is on
        // laptop speakers (no headphones). Required for accurate speaker
        // labelling. Headphones are still ideal; this is the software safety net.
        echoCancellation: true,
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

  // Optional recording: mix mic + system audio (and optionally video) into a
  // single MediaStream and record it.
  let recorder: MediaRecorder | null = null
  const recordingChunks: Blob[] = []
  let recordedMimeType = wantVideo ? 'video/webm' : 'audio/webm'
  const wantRecording = wantVideo || !!callbacks.recordAudio

  if (wantRecording) {
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

      const videoTrack = wantVideo ? systemStream.getVideoTracks()[0] : null
      if (wantVideo && !videoTrack) {
        console.warn('[recording] recordVideo requested but no video track — falling back to audio-only')
      }
      const recordingStream = videoTrack
        ? new MediaStream([videoTrack, ...dest.stream.getAudioTracks()])
        : dest.stream

      const audioCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ]
      const videoCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264,opus',
        'video/webm',
        'video/mp4'
      ]
      const candidates = videoTrack ? videoCandidates : audioCandidates
      const supported = candidates.find((c) => MediaRecorder.isTypeSupported(c))
      if (!supported) {
        console.warn('[recording] no supported MediaRecorder mimeType — recording disabled')
      } else {
        recordedMimeType = supported
        const recorderOpts: MediaRecorderOptions = {
          mimeType: supported,
          audioBitsPerSecond: 64000
        }
        if (videoTrack) {
          // ~1.5 Mbps gives decent 720p quality at manageable file size
          recorderOpts.videoBitsPerSecond = 1_500_000
        }
        recorder = new MediaRecorder(recordingStream, recorderOpts)
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordingChunks.push(e.data)
        }
        recorder.start(1000) // emit chunks every 1s
        console.log(
          `[recording] started ${videoTrack ? 'video+audio' : 'audio'} (${supported})`
        )
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
