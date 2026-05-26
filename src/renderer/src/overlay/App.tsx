import { useEffect, useRef, useState } from 'react'
import type {
  Suggestion,
  AppSettings,
  CallArtifacts,
  TranscriptSegment
} from '../../../shared/types'
import { BRAND } from '../../../shared/branding'
import { startAudioCapture, type AudioCaptureHandle } from '../audio-capture'

export default function App(): JSX.Element {
  const [active, setActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  // Last 2 fully-streamed suggestions, newest first. Lets the rep still see the
  // previous reply when a new one starts generating.
  const [previousSuggestions, setPreviousSuggestions] = useState<Suggestion[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const [lastCallArtifacts, setLastCallArtifacts] = useState<CallArtifacts | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([])
  const [interim, setInterim] = useState<TranscriptSegment | null>(null)
  const audioRef = useRef<AudioCaptureHandle | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setSettings(s)
      // Honor the "Show live transcript" essential toggle from Settings on first load.
      if (s?.featureShowTranscript) setShowTranscript(true)
      setNotesDraft(s?.userNotes ?? '')
    })

    const off1 = window.api.on.transcript((seg) => {
      if (seg.isFinal) {
        setTranscript((prev) => [...prev.slice(-50), seg])
        setInterim(null)
      } else {
        setInterim(seg)
      }
    })
    const off2 = window.api.on.suggestion((sug) => {
      setSuggestion((prev) => {
        // New suggestion id → archive the previous one (if any) into history.
        if (prev && prev.id !== sug.id && prev.text) {
          setPreviousSuggestions((hist) => [prev, ...hist].slice(0, 2))
        }
        return sug
      })
    })
    const off3 = window.api.on.sessionStatus((s) => {
      setActive(s.active)
      if (s.error) setError(s.error)
    })
    const off4 = window.api.on.settingsChanged((s) => {
      setSettings(s)
      // Keep the live transcript toggle in sync with the Settings essential toggle.
      setShowTranscript(!!s.featureShowTranscript)
      // Sync notes draft only if the panel is closed — avoid yanking text from
      // under the user while they're typing.
      setShowNotes((isOpen) => {
        if (!isOpen) setNotesDraft(s.userNotes ?? '')
        return isOpen
      })
    })
    return () => {
      off1()
      off2()
      off3()
      off4()
      if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (showTranscript) {
      transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [transcript.length, interim, showTranscript])

  async function refreshSettings(): Promise<AppSettings | null> {
    const s = await window.api.settings.get()
    setSettings(s)
    return s
  }

  async function handleStart(): Promise<void> {
    setError(null)
    setStarting(true)
    setLastCallArtifacts(null)
    setSuggestion(null)
    setPreviousSuggestions([])
    setTranscript([])
    setInterim(null)
    try {
      const s = await refreshSettings()
      const res = await window.api.session.start()
      if (!res.ok) {
        setError(res.error ?? 'Failed to start')
        setStarting(false)
        return
      }
      audioRef.current = await startAudioCapture({
        onSystemChunk: (chunk) => window.api.session.sendSystemAudio(chunk),
        onMicChunk: (chunk) => window.api.session.sendMicAudio(chunk),
        recordAudio: !!s?.featureRecordAudio,
        recordVideo: !!s?.featureRecordVideo
      })
      setActive(true)
    } catch (err: any) {
      setError(err?.message ?? 'Audio capture failed')
      await window.api.session.stop()
    } finally {
      setStarting(false)
    }
  }

  async function handleStop(): Promise<void> {
    setFinalizing(true)
    try {
      const result = await audioRef.current?.stop()
      audioRef.current = null
      setActive(false)

      // Save recording if we captured one (presence of result.recording means
      // recording was active for this call regardless of current settings state)
      if (result?.recording && result.recording.size > 0) {
        const buf = await result.recording.arrayBuffer()
        const saveRes = await window.api.session.saveRecording(
          buf,
          result.recording.type || 'audio/webm'
        )
        console.log('[overlay] recording save result:', saveRes)
      }

      // Finalize: triggers transcript save + summary generation per settings
      const artifacts = await window.api.session.finalize()
      setLastCallArtifacts(artifacts)

      await window.api.session.stop()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to finalize call')
    } finally {
      setFinalizing(false)
    }
  }

  function handleManualSuggest(): void {
    void window.api.session.requestSuggestion()
  }

  // Debounced notes save: keep typing fluid, flush to backend 500ms after
  // the user stops typing.
  function handleNotesChange(value: string): void {
    setNotesDraft(value)
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current)
    notesSaveTimerRef.current = setTimeout(() => {
      void window.api.settings.set({ userNotes: value })
    }, 500)
  }

  function handleCopySuggestion(): void {
    if (suggestion?.text) {
      navigator.clipboard.writeText(stripPreamble(suggestion.text)).catch(() => undefined)
    }
  }

  const recordingVideo = active && !!settings?.featureRecordVideo
  const recording = active && (!!settings?.featureRecordAudio || recordingVideo)
  const liveSuggestionsEnabled = settings?.featureLiveSuggestions ?? true
  const hasLlmKey =
    !!settings &&
    (settings.llmProvider === 'custom'
      ? !!settings.customBaseUrl
      : settings.llmProvider === 'openai'
        ? !!settings.openaiApiKey
        : !!settings.anthropicApiKey)
  const hasSttKey =
    !!settings &&
    (settings.sttProvider === 'groq' ? !!settings.groqApiKey : !!settings.deepgramApiKey)
  const needsSetup =
    !!settings && (!hasSttKey || !hasLlmKey || !settings.activeTemplateId)
  const canStart = !!settings && hasSttKey

  return (
    <div className="h-full w-full p-3">
      <div className="relative h-full w-full flex flex-col rounded-2xl bg-panel backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden">
        <header className="draggable flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                active
                  ? 'bg-accent animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                  : 'bg-white/30'
              }`}
            />
            <span className="text-sm font-semibold tracking-wide">{BRAND.productName}</span>
            {recording && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 ml-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {recordingVideo ? 'REC •VIDEO' : 'REC'}
              </span>
            )}
          </div>
          <div className="no-drag flex items-center gap-1.5">
            <NotesToggle
              on={showNotes}
              hasNotes={notesDraft.trim().length > 0}
              onChange={setShowNotes}
            />
            <TranscriptToggle
              on={showTranscript}
              onChange={setShowTranscript}
            />
            <button
              onClick={() => window.api.settings.open()}
              className="text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10"
            >
              Settings
            </button>
            {active ? (
              <button
                onClick={handleStop}
                disabled={finalizing}
                className="text-xs bg-danger/80 hover:bg-danger text-white px-3 py-1 rounded-full font-medium disabled:opacity-60"
              >
                {finalizing ? 'Saving…' : 'Stop'}
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={starting || !canStart}
                title={!canStart ? 'Add API keys in Settings first' : 'Start session'}
                className="text-xs bg-accent/90 hover:bg-accent text-black px-3 py-1 rounded-full font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {starting ? 'Starting…' : 'Start'}
              </button>
            )}
            <button
              onClick={() => window.api.window.minimize()}
              title="Minimize"
              className="text-white/60 hover:text-white hover:bg-white/10 rounded w-6 h-6 flex items-center justify-center text-base leading-none"
            >
              −
            </button>
            <button
              onClick={() => window.api.window.hide()}
              title="Hide (reopen from tray icon)"
              className="text-white/60 hover:text-white hover:bg-danger/60 rounded w-6 h-6 flex items-center justify-center text-base leading-none"
            >
              ×
            </button>
          </div>
        </header>

        {error && (
          <div className="px-4 py-2 bg-danger/20 border-b border-danger/30 text-xs text-red-200">
            {error}
          </div>
        )}

        {needsSetup && !active && (
          <div className="px-5 py-4 bg-accent2/10 border-b border-accent2/30 space-y-3">
            <div className="text-sm font-semibold text-accent2">
              Welcome to {BRAND.productName} — 30 seconds to set up
            </div>
            <ol className="text-xs text-white/80 space-y-1.5 list-decimal list-inside">
              <li className={settings?.activeTemplateId ? 'line-through opacity-50' : ''}>
                Pick a template (sales / support / interview / etc.)
              </li>
              <li className={hasSttKey ? 'line-through opacity-50' : ''}>
                Add your {settings?.sttProvider === 'groq' ? 'Groq' : 'Deepgram'} API key (for
                transcription)
              </li>
              <li className={hasLlmKey ? 'line-through opacity-50' : ''}>
                Add your{' '}
                {settings?.llmProvider === 'custom'
                  ? 'endpoint URL'
                  : settings?.llmProvider === 'openai'
                    ? 'OpenAI'
                    : 'Anthropic'}{' '}
                {settings?.llmProvider === 'custom' ? '(Ollama / LM Studio)' : 'API key'} (for AI
                suggestions)
              </li>
            </ol>
            <button
              onClick={() => window.api.settings.open()}
              className="bg-accent2 hover:bg-blue-500 text-white text-xs font-medium px-4 py-1.5 rounded-md"
            >
              Open Settings →
            </button>
          </div>
        )}

        {lastCallArtifacts && !active && (
          <div className="px-4 py-3 bg-accent/10 border-b border-accent/30 text-xs space-y-1.5">
            <div className="font-semibold text-accent">Call saved ✓</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
              {lastCallArtifacts.recordingPath && (
                <button
                  onClick={() => window.api.storage.openFile(lastCallArtifacts.recordingPath!)}
                  className="text-white/80 hover:text-white underline"
                >
                  {settings?.featureRecordVideo ? '🎬 Video' : '🎙 Recording'}
                </button>
              )}
              {lastCallArtifacts.transcriptTxtPath && (
                <button
                  onClick={() => window.api.storage.openFile(lastCallArtifacts.transcriptTxtPath!)}
                  className="text-white/80 hover:text-white underline"
                >
                  📄 Transcript (.txt)
                </button>
              )}
              {lastCallArtifacts.transcriptMdPath && (
                <button
                  onClick={() => window.api.storage.openFile(lastCallArtifacts.transcriptMdPath!)}
                  className="text-white/60 hover:text-white underline"
                >
                  .md
                </button>
              )}
              {lastCallArtifacts.summaryTxtPath && (
                <button
                  onClick={() => window.api.storage.openFile(lastCallArtifacts.summaryTxtPath!)}
                  className="text-white/80 hover:text-white underline"
                >
                  📋 Summary (.txt)
                </button>
              )}
              {lastCallArtifacts.summaryMdPath && (
                <button
                  onClick={() => window.api.storage.openFile(lastCallArtifacts.summaryMdPath!)}
                  className="text-white/60 hover:text-white underline"
                >
                  .md
                </button>
              )}
              <button
                onClick={() => window.api.storage.openRecordingsFolder()}
                className="text-white/60 hover:text-white underline ml-auto"
              >
                Open folder
              </button>
            </div>
          </div>
        )}

        {liveSuggestionsEnabled && (
          <section
            className={`no-drag flex flex-col px-5 py-4 overflow-hidden ${
              showTranscript ? 'flex-[3]' : 'flex-1'
            }`}
          >
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-xs uppercase tracking-wider text-accent/90 font-semibold">
                Suggested reply
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleManualSuggest}
                  disabled={!active}
                  className="text-xs text-white/70 hover:text-white px-2.5 py-1 rounded-md hover:bg-white/10 disabled:opacity-40"
                >
                  Regenerate
                </button>
                {suggestion?.text && (
                  <button
                    onClick={handleCopySuggestion}
                    className="text-xs text-white/70 hover:text-white px-2.5 py-1 rounded-md hover:bg-white/10"
                  >
                    Copy
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3">
              <SuggestionBox
                text={suggestion?.text}
                status={suggestion?.status}
                active={active}
                themLabel={settings?.speakerLabelThem ?? 'the other side'}
              />
              {previousSuggestions.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold px-1">
                    Previous
                  </div>
                  {previousSuggestions.map((s) => (
                    <PreviousSuggestion key={s.id} suggestion={s} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {showTranscript && (
          <section
            className={`no-drag flex flex-col overflow-hidden ${
              liveSuggestionsEnabled ? 'flex-[2] border-t border-white/10' : 'flex-1'
            }`}
          >
            <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
              <span className="text-xs uppercase tracking-wider text-white/50 font-semibold">
                Transcript
              </span>
              <button
                onClick={() => setShowTranscript(false)}
                className="text-[10px] text-white/40 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/10"
                title="Hide transcript"
              >
                Hide
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-3 text-sm space-y-2.5">
              {transcript.length === 0 && !interim && (
                <div className="text-white/30 italic">Conversation will show here…</div>
              )}
              {transcript.map((seg) => (
                <TranscriptLine
                  key={seg.id}
                  seg={seg}
                  meLabel={settings?.speakerLabelMe ?? 'You'}
                  themLabel={settings?.speakerLabelThem ?? 'Other'}
                />
              ))}
              {interim && (
                <TranscriptLine
                  seg={interim}
                  meLabel={settings?.speakerLabelMe ?? 'You'}
                  themLabel={settings?.speakerLabelThem ?? 'Other'}
                  interim
                />
              )}
              <div ref={transcriptEndRef} />
            </div>
          </section>
        )}

        {!liveSuggestionsEnabled && !showTranscript && (
          <section className="no-drag flex-1 flex flex-col items-center justify-center px-8 py-10 text-center">
            <div className="text-4xl mb-3 opacity-50">🌙</div>
            <div className="text-sm font-semibold text-white/70 mb-1">Nothing turned on</div>
            <p className="text-xs text-white/40 max-w-xs mb-4 leading-relaxed">
              Enable <span className="text-white/70">Live AI suggestions</span> or{' '}
              <span className="text-white/70">Show live transcript</span> in Settings to see content
              here.
            </p>
            <button
              onClick={() => window.api.settings.open()}
              className="text-xs bg-accent/90 hover:bg-accent text-black px-3 py-1.5 rounded-full font-medium"
            >
              Open Settings
            </button>
          </section>
        )}

        {/* Slide-in notes panel — covers overlay content from the left when open */}
        <div
          className={`absolute inset-y-0 left-0 w-full flex flex-col bg-panel/95 backdrop-blur-xl border-r border-white/10 transition-transform duration-200 ease-out z-20 ${
            showNotes ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base">📝</span>
              <span className="text-sm font-semibold tracking-wide">Notes</span>
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                pre-meeting cheat sheet
              </span>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="text-white/60 hover:text-white hover:bg-white/10 rounded w-6 h-6 flex items-center justify-center text-base leading-none"
              title="Close notes"
            >
              ×
            </button>
          </div>
          <div className="flex-1 flex flex-col px-5 py-4 gap-2 overflow-hidden">
            <textarea
              value={notesDraft}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder={
                'Write talking points, prices, names, key facts here.\n\nExample:\n• Patient — knee surgery, Mr. Sharma, ₹3.5L budget\n• Mention free transport + hotel\n• Hospital: Fortis Bangalore, Dr. Vasu — 25+ years\n• If price objection → offer EMI 12 months'
              }
              className="flex-1 w-full bg-white/[0.04] border border-white/10 rounded-lg p-3 text-sm leading-relaxed focus:border-accent outline-none resize-none placeholder:text-white/30"
              autoFocus
            />
            <div className="flex items-center justify-between text-[10px] text-white/40">
              <span>Auto-saves while you type. Private — AI does not see this.</span>
              <span>{notesDraft.length} chars</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function NotesToggle({
  on,
  hasNotes,
  onChange
}: {
  on: boolean
  hasNotes: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      title={on ? 'Close notes' : 'Open notes'}
      className={`relative flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
        on
          ? 'bg-accent2/20 text-accent2 hover:bg-accent2/30'
          : 'text-white/50 hover:text-white hover:bg-white/10'
      }`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="13" y2="17" />
      </svg>
      {hasNotes && !on && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent2" />
      )}
    </button>
  )
}

function TranscriptToggle({
  on,
  onChange
}: {
  on: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      onClick={() => onChange(!on)}
      title={on ? 'Hide live transcript' : 'Show live transcript'}
      className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
        on
          ? 'bg-accent/20 text-accent hover:bg-accent/30'
          : 'text-white/50 hover:text-white hover:bg-white/10'
      }`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6h16M4 12h10M4 18h16" />
      </svg>
    </button>
  )
}

function TranscriptLine({
  seg,
  interim,
  meLabel,
  themLabel
}: {
  seg: TranscriptSegment
  interim?: boolean
  meLabel: string
  themLabel: string
}): JSX.Element {
  const isThem = seg.speaker === 'patient'
  const label = isThem ? themLabel : seg.speaker === 'sales' ? meLabel : 'Unknown'
  return (
    <div className={`flex gap-2.5 ${interim ? 'opacity-50' : ''}`}>
      <span
        className={`text-[11px] font-bold uppercase tracking-wider shrink-0 w-16 pt-0.5 truncate ${
          isThem ? 'text-accent2' : 'text-white/60'
        }`}
      >
        {label}
      </span>
      <span className="flex-1 text-white/90 leading-relaxed text-sm">{seg.text}</span>
    </div>
  )
}

function PreviousSuggestion({ suggestion }: { suggestion: Suggestion }): JSX.Element {
  const ageS = Math.max(1, Math.round((Date.now() - suggestion.createdAtMs) / 1000))
  const cleaned = stripPreamble(suggestion.text)
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-sm leading-relaxed text-white/70">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          {ageS}s ago
        </span>
        <button
          onClick={() => navigator.clipboard.writeText(cleaned).catch(() => undefined)}
          className="text-[10px] text-white/40 hover:text-white px-1.5 py-0.5 rounded hover:bg-white/10"
        >
          Copy
        </button>
      </div>
      <div className="whitespace-pre-wrap">{cleaned}</div>
    </div>
  )
}

function SuggestionBox({
  text,
  status,
  active,
  themLabel
}: {
  text?: string
  status?: 'streaming' | 'done' | 'error'
  active: boolean
  themLabel: string
}): JSX.Element {
  if (!text) {
    return (
      <div className="min-h-[200px] rounded-xl bg-accent/10 border border-accent/40 p-6 text-lg leading-relaxed text-emerald-50 shadow-inner flex items-center">
        <span className="text-white/40 italic font-normal">
          {active
            ? `Listening… suggestions appear when ${themLabel} speaks.`
            : 'Press Start to begin.'}
        </span>
      </div>
    )
  }
  return (
    <div className="min-h-[200px] rounded-xl bg-accent/10 border border-accent/40 p-6 text-emerald-50 shadow-inner">
      <RichSuggestionContent text={text} />
      {status === 'streaming' && (
        <span className="ml-1 inline-block w-2.5 h-5 bg-emerald-300 animate-pulse align-middle rounded-sm" />
      )}
    </div>
  )
}

/**
 * Renders suggestion text with markdown-aware code block + inline code styling.
 * Triple-backtick blocks become monospace boxes; rest is normal prose.
 */
/**
 * Strip common preambles the model sometimes prepends despite the prompt
 * telling it not to ("Reply:", "You could say:", "Here's a reply:", etc).
 */
function stripPreamble(text: string): string {
  return text.replace(
    /^\s*(reply|response|suggested reply|suggestion|you could say|you can say|here'?s? (a |the )?(reply|response|suggestion))\s*[:\-—]\s*/i,
    ''
  )
}

function RichSuggestionContent({ text }: { text: string }): JSX.Element {
  const cleaned = stripPreamble(text)
  // Split on ```...``` code fences while keeping them
  const parts = cleaned.split(/(```[\s\S]*?```)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3).replace(/^[a-zA-Z]*\n/, '').trim()
          return (
            <pre
              key={i}
              className="my-2 bg-black/40 border border-white/10 rounded-lg p-3 text-xs font-mono text-emerald-100 overflow-x-auto whitespace-pre"
            >
              {inner}
            </pre>
          )
        }
        return (
          <p
            key={i}
            className="text-xl leading-relaxed font-medium whitespace-pre-wrap"
          >
            {renderInlineCode(part)}
          </p>
        )
      })}
    </>
  )
}

function renderInlineCode(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g)
  return parts.map((p, i) =>
    p.startsWith('`') && p.endsWith('`') ? (
      <code key={i} className="px-1.5 py-0.5 rounded bg-black/30 text-emerald-200 font-mono text-lg">
        {p.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}
