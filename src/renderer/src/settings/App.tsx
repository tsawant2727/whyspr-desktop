import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { BRAND } from '../../../shared/branding'
import { TEMPLATES, type Template } from '../../../shared/templates'

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [recordingsDir, setRecordingsDir] = useState<string>('')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
    void window.api.storage.getRecordingsDir().then(setRecordingsDir)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  /**
   * Auto-save on change. Toggles save immediately; text fields debounce 400ms so
   * we don't spam disk while user types.
   */
  function update<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
    immediate = false
  ): void {
    console.log('[settings] update called:', key, '=', value, 'immediate:', immediate)
    if (!settings) {
      console.warn('[settings] update skipped — settings not loaded yet')
      return
    }
    const next = { ...settings, [key]: value }
    setSettings(next)

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')

    const persist = async (): Promise<void> => {
      try {
        console.log('[settings] saving to backend:', { [key]: value })
        const saved = await window.api.settings.set({ [key]: value } as Partial<AppSettings>)
        console.log('[settings] backend confirmed save:', saved[key])
        setSettings(saved)
        setSaveStatus('saved')
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
      } catch (err) {
        console.error('[settings] save failed:', err)
        setSaveStatus('error')
      }
    }

    if (immediate) {
      void persist()
    } else {
      saveTimerRef.current = setTimeout(persist, 400)
    }
  }

  async function handleApplyTemplate(tpl: Template): Promise<void> {
    const confirmed = window.confirm(
      `Apply "${tpl.name}" template?\n\nThis will overwrite:\n• System prompt\n• Speaker labels\n• Feature toggles\n\nYour API keys and custom save folder will not change. Continue?`
    )
    if (!confirmed) return
    setSaveStatus('saving')
    const updated = await window.api.settings.applyTemplate(tpl.id)
    setSettings(updated)
    setSaveStatus('saved')
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1500)
  }

  if (!settings) {
    return <div className="p-8 text-white/60">Loading…</div>
  }

  const activeTemplate = TEMPLATES.find((t) => t.id === settings.activeTemplateId)

  return (
    <div className="min-h-screen bg-bg text-white">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{BRAND.productName} Settings</h1>
            <p className="text-sm text-white/50 mt-1">
              Changes save automatically. Everything stored locally + encrypted.
            </p>
          </div>
          <SaveIndicator status={saveStatus} />
        </header>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
              Quick start — pick a template
            </h2>
            {activeTemplate && (
              <span className="text-xs text-accent">
                Active: {activeTemplate.icon} {activeTemplate.name}
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 -mt-2">
            Each template sets the system prompt, speaker labels, and recommended features for your use case. Click to apply — you can customize after.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TEMPLATES.map((tpl) => {
              const isActive = settings.activeTemplateId === tpl.id
              return (
                <button
                  key={tpl.id}
                  onClick={() => handleApplyTemplate(tpl)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-accent/15 border-accent/60'
                      : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{tpl.icon}</span>
                    <span className="text-sm font-semibold">{tpl.name}</span>
                  </div>
                  <p className="text-xs text-white/50 leading-snug">{tpl.shortDescription}</p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            API Keys
          </h2>
          <Field
            label="Deepgram API Key"
            hint="Real-time speech-to-text. Get one at console.deepgram.com"
          >
            <input
              type="password"
              value={settings.deepgramApiKey}
              onChange={(e) => update('deepgramApiKey', e.target.value)}
              placeholder="dg_..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
            />
          </Field>
          <Field
            label="Anthropic API Key"
            hint="Claude API for suggestions. Get one at console.anthropic.com"
          >
            <input
              type="password"
              value={settings.anthropicApiKey}
              onChange={(e) => update('anthropicApiKey', e.target.value)}
              placeholder="sk-ant-..."
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
            />
          </Field>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Behavior
          </h2>
          <Field label="Language" hint="Multi handles Hinglish + regional code-switching.">
            <select
              value={settings.language}
              onChange={(e) => update('language', e.target.value as AppSettings['language'])}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
            >
              <option value="multi">Multi (Hindi/English/regional)</option>
              <option value="en">English (Indian)</option>
              <option value="hi">Hindi</option>
            </select>
          </Field>
          <Field
            label="Claude model"
            hint="Haiku 4.5 is fastest and cheapest. Sonnet for higher quality."
          >
            <select
              value={settings.llmModel}
              onChange={(e) => update('llmModel', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
            >
              <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (fast)</option>
              <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (balanced)</option>
              <option value="claude-opus-4-7">Claude Opus 4.7 (highest quality, slow)</option>
            </select>
          </Field>
          <Field
            label="Silence before suggesting (ms)"
            hint="How long to wait after patient stops speaking. Lower = more aggressive."
          >
            <input
              type="number"
              min={500}
              max={5000}
              step={100}
              value={settings.suggestionTriggerSilenceMs}
              onChange={(e) => update('suggestionTriggerSilenceMs', Number(e.target.value))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
            />
          </Field>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Features — choose what you want
          </h2>
          <p className="text-xs text-white/50 -mt-2">
            Mix and match per your use case. Sales? Just enable live suggestions. Doctor visit? Record + transcript + summary.
          </p>

          <Toggle
            label="Live AI suggestions during call"
            hint="Real-time reply suggestions as the other person speaks. Needs Anthropic key."
            value={settings.featureLiveSuggestions}
            onChange={(v) => update('featureLiveSuggestions', v)}
          />
          <Toggle
            label="Record audio (save .webm locally)"
            hint="Saves a mixed audio file of both sides to your computer. Nothing uploaded."
            value={settings.featureRecordAudio}
            onChange={(v) => update('featureRecordAudio', v)}
          />
          <Toggle
            label="Save transcript after call (.md)"
            hint="Saves a markdown transcript with speaker labels and timestamps."
            value={settings.featureSaveTranscript}
            onChange={(v) => update('featureSaveTranscript', v)}
          />
          <Toggle
            label="Generate AI summary after call"
            hint="At end of call, Claude produces a structured summary: key points, action items, sentiment, follow-ups. Uses Anthropic API."
            value={settings.featureGenerateSummary}
            onChange={(v) => update('featureGenerateSummary', v)}
          />

          <div className="rounded-lg bg-white/5 border border-white/10 p-4 text-xs space-y-3">
            <div className="text-white/60 uppercase tracking-wider font-semibold text-[10px]">
              Save folder
            </div>
            <div className="font-mono text-white/80 break-all bg-black/20 rounded p-2">
              {recordingsDir || '—'}
            </div>
            {!settings.customRecordingsDir && (
              <div className="text-white/40">
                Using default app location. Choose a custom folder below if you want files saved elsewhere (Desktop, Documents, etc.)
              </div>
            )}
            {settings.customRecordingsDir && (
              <div className="text-accent">
                ✓ Custom folder set
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={async () => {
                  const res = await window.api.storage.chooseFolder()
                  if (!res.canceled && res.path) {
                    update('customRecordingsDir', res.path, true)
                    const fresh = await window.api.storage.getRecordingsDir()
                    setRecordingsDir(fresh)
                  }
                }}
                className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-md font-medium"
              >
                Choose folder…
              </button>
              {settings.customRecordingsDir && (
                <button
                  onClick={async () => {
                    update('customRecordingsDir', '', true)
                    const fresh = await window.api.storage.getRecordingsDir()
                    setRecordingsDir(fresh)
                  }}
                  className="text-white/60 hover:text-white px-3 py-1.5 rounded-md"
                >
                  Reset to default
                </button>
              )}
              <button
                onClick={() => window.api.storage.openRecordingsFolder()}
                className="text-accent hover:underline ml-auto"
              >
                Open folder →
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Speaker labels
          </h2>
          <p className="text-xs text-white/50 -mt-2">
            How sides are labeled in transcripts and AI prompt. Customize per your use case.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Your side (microphone)" hint="e.g. You, Sales, Doctor, Interviewer">
              <input
                type="text"
                value={settings.speakerLabelMe}
                onChange={(e) => update('speakerLabelMe', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
              />
            </Field>
            <Field label="Other side (system audio)" hint="e.g. Other, Patient, Customer, Candidate">
              <input
                type="text"
                value={settings.speakerLabelThem}
                onChange={(e) => update('speakerLabelThem', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
              />
            </Field>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            System Prompt
          </h2>
          <p className="text-xs text-white/50">
            This is the full instruction set Claude uses for every suggestion. Paste objection
            handling scripts, product details, FAQs, tone guidelines, anything you want the AI
            to know.
          </p>
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => update('systemPrompt', e.target.value)}
            rows={22}
            className="w-full font-mono text-xs bg-white/5 border border-white/10 rounded-lg p-4 focus:border-accent outline-none leading-relaxed"
          />
          <div className="text-xs text-white/40">
            ~{settings.systemPrompt.length.toLocaleString()} characters
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <label className="block space-y-1">
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-white/40">{hint}</div>}
      {children}
    </label>
  )
}

function SaveIndicator({
  status
}: {
  status: 'idle' | 'saving' | 'saved' | 'error'
}): JSX.Element {
  if (status === 'idle') {
    return <span className="text-xs text-white/40">Auto-save enabled</span>
  }
  if (status === 'saving') {
    return (
      <span className="text-xs text-white/60 flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-white/40 animate-pulse" />
        Saving…
      </span>
    )
  }
  if (status === 'saved') {
    return (
      <span className="text-xs text-accent flex items-center gap-1.5">
        <span>✓</span>
        Saved
      </span>
    )
  }
  return <span className="text-xs text-danger">Save failed</span>
}

function Toggle({
  label,
  hint,
  value,
  onChange
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="flex items-start gap-3 cursor-pointer group select-none">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          console.log('[toggle]', label, 'changed to:', e.target.checked)
          onChange(e.target.checked)
        }}
        className="sr-only peer"
      />
      <span
        className={`mt-0.5 relative w-10 h-6 rounded-full transition-colors shrink-0 ${
          value ? 'bg-accent' : 'bg-white/20'
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
            value ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium group-hover:text-white">{label}</span>
        {hint && <span className="block text-xs text-white/40 mt-0.5">{hint}</span>}
      </span>
    </label>
  )
}
