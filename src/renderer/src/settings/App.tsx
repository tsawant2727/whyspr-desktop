import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { BRAND } from '../../../shared/branding'
import { TEMPLATES, type Template } from '../../../shared/templates'

type SectionId =
  | 'essentials'
  | 'freeguide'
  | 'templates'
  | 'apikeys'
  | 'behavior'
  | 'recording'
  | 'savefolder'
  | 'speakers'
  | 'prompt'

const NAV_SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'essentials', label: 'Essentials', icon: '⚡' },
  { id: 'freeguide', label: 'Run it free', icon: '💸' },
  { id: 'templates', label: 'Templates', icon: '📋' },
  { id: 'prompt', label: 'System Prompt', icon: '✏️' },
  { id: 'apikeys', label: 'API Keys', icon: '🔑' },
  { id: 'behavior', label: 'Behavior', icon: '⚙️' },
  { id: 'recording', label: 'Recording', icon: '🎙' },
  { id: 'savefolder', label: 'Save folder', icon: '📁' },
  { id: 'speakers', label: 'Speaker labels', icon: '👥' }
]

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [recordingsDir, setRecordingsDir] = useState<string>('')
  const [activeSection, setActiveSection] = useState<SectionId>('essentials')
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
    <div className="min-h-screen bg-bg text-white flex">
      <aside className="w-56 shrink-0 border-r border-white/10 bg-white/[0.02] flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-base font-bold leading-tight">{BRAND.productName}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 mt-0.5">
            Settings
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_SECTIONS.map((s) => {
            const isActive = activeSection === s.id
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                  isActive
                    ? 'bg-accent/15 text-white font-medium'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="text-base leading-none">{s.icon}</span>
                <span className="flex-1">{s.label}</span>
                {isActive && (
                  <span className="w-1 h-4 rounded-full bg-accent shrink-0" aria-hidden />
                )}
              </button>
            )
          })}
        </nav>
        <div className="px-3 py-3 border-t border-white/10">
          <SaveIndicator status={saveStatus} />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-8 space-y-6">
        {activeSection === 'essentials' && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60 mb-3">
            Essentials — turn these on
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <BigToggle
              icon="🤖"
              label="Live AI suggestions"
              hint="Real-time reply suggestions as the other person speaks"
              value={settings.featureLiveSuggestions}
              onChange={(v) => update('featureLiveSuggestions', v, true)}
            />
            <BigToggle
              icon="📝"
              label="Show live transcript"
              hint="Display the running conversation transcript in the overlay"
              value={settings.featureShowTranscript}
              onChange={(v) => update('featureShowTranscript', v, true)}
            />
          </div>
        </section>
        )}

        {activeSection === 'freeguide' && (
        <section className="space-y-5">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
              Run Whyspr for ₹0
            </h2>
            <p className="text-xs text-white/50 mt-1">
              Use free-tier providers instead of paid. Quality almost same, cost zero.
            </p>
          </div>

          <div className="rounded-xl border-2 border-accent/40 bg-accent/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🥇</span>
              <span className="text-sm font-bold text-accent">
                RECOMMENDED — Fully free cloud combo
              </span>
            </div>
            <div className="text-sm text-white/80 leading-relaxed">
              <strong>STT:</strong> Groq Whisper (14,400 free req/day)
              <br />
              <strong>LLM:</strong> Groq Llama-3.3-70B (same free tier, very fast)
              <br />
              <strong>Cost:</strong> <span className="text-accent">₹0</span> for ~50 calls/day per
              Groq account
            </div>
            <div className="text-xs text-white/50 leading-relaxed">
              Both STT and LLM via the same Groq key. Best balance of speed, quality, and zero
              cost. Requires internet.
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🥈</span>
              <span className="text-sm font-bold">Hybrid — Groq STT + Ollama LLM</span>
            </div>
            <div className="text-sm text-white/80 leading-relaxed">
              <strong>STT:</strong> Groq Whisper (cloud, free tier)
              <br />
              <strong>LLM:</strong> Ollama (runs on your PC, offline, FREE)
              <br />
              <strong>Cost:</strong> <span className="text-accent">₹0</span> — needs ~8GB RAM
            </div>
            <div className="text-xs text-white/50 leading-relaxed">
              LLM stays on your machine, only transcription goes to cloud. More private.
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-white/60 font-semibold pt-2">
              Setup steps (Groq combo)
            </h3>
            <ol className="space-y-3 text-sm text-white/80">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
                  1
                </span>
                <div className="space-y-1">
                  <div>
                    Sign up at{' '}
                    <span className="text-accent font-mono text-xs">console.groq.com</span>
                  </div>
                  <div className="text-xs text-white/50">
                    Free, no credit card. Use any email.
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
                  2
                </span>
                <div className="space-y-1">
                  <div>
                    Go to{' '}
                    <span className="text-accent font-mono text-xs">console.groq.com/keys</span>{' '}
                    → Create API key → copy
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
                  3
                </span>
                <div className="space-y-1">
                  <div>
                    In <span className="text-white">API Keys</span> tab:
                  </div>
                  <ul className="text-xs text-white/60 space-y-1 ml-2">
                    <li>• Speech-to-text provider → <strong>Groq Whisper</strong></li>
                    <li>• Paste key in Groq API Key field</li>
                    <li>• LLM provider → <strong>Custom / Local</strong></li>
                    <li>
                      • Click <strong>⚡ Groq (cloud, free tier)</strong> preset
                    </li>
                    <li>• Paste same Groq key in API Key field</li>
                  </ul>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
                  4
                </span>
                <div>
                  Back to overlay → Start. Done — fully free.
                </div>
              </li>
            </ol>
          </div>

          <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-4 space-y-2">
            <div className="text-xs font-semibold text-yellow-300 uppercase tracking-wider">
              💡 Trick — Multi-account switching
            </div>
            <p className="text-xs text-white/70 leading-relaxed">
              Groq free tier resets every 24 hours. If you hit the limit, create a second Groq
              account with a different email and paste that key. Switch keys in Settings on the
              fly — auto-save reflects immediately, no restart needed.
            </p>
            <p className="text-xs text-white/50 leading-relaxed">
              For heavy users: keep 2-3 keys in a notes app. When one hits limit, paste next.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-white/60 font-semibold pt-2">
              Setup Ollama (for hybrid combo)
            </h3>
            <ol className="space-y-3 text-sm text-white/80">
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
                  1
                </span>
                <div className="space-y-1">
                  <div>
                    Download Ollama: <span className="text-accent font-mono text-xs">ollama.com</span>
                  </div>
                  <div className="text-xs text-white/50">Free, Mac/Windows/Linux supported.</div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
                  2
                </span>
                <div className="space-y-1">
                  <div>In terminal, pull a model:</div>
                  <div className="font-mono text-xs bg-black/30 rounded px-2 py-1 text-emerald-200 inline-block">
                    ollama pull llama3.1:8b
                  </div>
                  <div className="text-xs text-white/50">
                    ~5GB download. Other options: qwen2.5:7b, mistral:7b.
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
                  3
                </span>
                <div>
                  Ollama auto-runs on <span className="font-mono text-xs">localhost:11434</span>.
                  In Settings → LLM provider → Custom → click <strong>🦙 Ollama</strong> preset.
                </div>
              </li>
            </ol>
          </div>

          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-4 space-y-2 text-xs">
            <div className="font-semibold text-white/70 uppercase tracking-wider">
              Cost comparison (per 30-min call)
            </div>
            <table className="w-full text-white/70 mt-2">
              <thead>
                <tr className="text-white/40 text-[10px] uppercase tracking-wider">
                  <th className="text-left pb-2">Combo</th>
                  <th className="text-right pb-2">Cost</th>
                </tr>
              </thead>
              <tbody className="space-y-1">
                <tr>
                  <td className="py-1">Deepgram + Claude Haiku</td>
                  <td className="text-right text-white/60">~₹15</td>
                </tr>
                <tr>
                  <td className="py-1">Deepgram + OpenAI gpt-4o-mini</td>
                  <td className="text-right text-white/60">~₹14</td>
                </tr>
                <tr className="border-t border-white/10">
                  <td className="py-1 text-accent">⭐ Groq STT + Groq LLM</td>
                  <td className="text-right text-accent font-bold">₹0</td>
                </tr>
                <tr>
                  <td className="py-1 text-accent">Groq STT + Ollama local</td>
                  <td className="text-right text-accent font-bold">₹0</td>
                </tr>
              </tbody>
            </table>
            <div className="text-white/40 pt-1">
              Free combos save ~₹450/month if you do 30 calls/month.
            </div>
          </div>
        </section>
        )}

        {activeSection === 'templates' && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
              Pick a template
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
        )}

        {activeSection === 'apikeys' && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            API Keys
          </h2>
          <Field
            label="Speech-to-text provider"
            hint="Deepgram = paid, lowest latency. Groq Whisper = FREE tier, very fast."
          >
            <select
              value={settings.sttProvider}
              onChange={(e) =>
                update('sttProvider', e.target.value as AppSettings['sttProvider'])
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
            >
              <option value="deepgram">Deepgram (paid, $0.13 per 30 min)</option>
              <option value="groq">Groq Whisper (FREE tier, ~14k req/day)</option>
            </select>
          </Field>
          {settings.sttProvider === 'deepgram' && (
            <Field
              label="Deepgram API Key"
              hint="Get one at console.deepgram.com — $200 free credit on signup."
            >
              <input
                type="password"
                value={settings.deepgramApiKey}
                onChange={(e) => update('deepgramApiKey', e.target.value)}
                placeholder="dg_..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
              />
            </Field>
          )}
          {settings.sttProvider === 'groq' && (
            <Field
              label="Groq API Key"
              hint="Get one free at console.groq.com/keys — generous free tier, no card required."
            >
              <input
                type="password"
                value={settings.groqApiKey}
                onChange={(e) => update('groqApiKey', e.target.value)}
                placeholder="gsk_..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
              />
            </Field>
          )}
          <Field
            label="LLM provider"
            hint="Anthropic, OpenAI, or any custom OpenAI-compatible endpoint (Ollama, LM Studio, Groq, OpenRouter)."
          >
            <select
              value={settings.llmProvider}
              onChange={(e) =>
                update('llmProvider', e.target.value as AppSettings['llmProvider'])
              }
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
              <option value="custom">Custom / Local (Ollama, LM Studio, Groq, OpenRouter…)</option>
            </select>
          </Field>
          {settings.llmProvider === 'anthropic' && (
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
          )}
          {settings.llmProvider === 'openai' && (
            <Field
              label="OpenAI API Key"
              hint="GPT API for suggestions. Get one at platform.openai.com/api-keys"
            >
              <input
                type="password"
                value={settings.openaiApiKey}
                onChange={(e) => update('openaiApiKey', e.target.value)}
                placeholder="sk-..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
              />
            </Field>
          )}
          {settings.llmProvider === 'custom' && (
            <div className="space-y-3 rounded-lg bg-white/[0.03] border border-white/10 p-4">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
                Quick presets
              </div>
              <div className="flex flex-wrap gap-2">
                <PresetButton
                  label="🦙 Ollama (local)"
                  onClick={() => {
                    update('customBaseUrl', 'http://localhost:11434/v1', true)
                    update('customApiKey', 'ollama', true)
                    update('customModel', 'llama3.1:8b', true)
                  }}
                />
                <PresetButton
                  label="🖥 LM Studio (local)"
                  onClick={() => {
                    update('customBaseUrl', 'http://localhost:1234/v1', true)
                    update('customApiKey', 'lm-studio', true)
                    update('customModel', 'local-model', true)
                  }}
                />
                <PresetButton
                  label="⚡ Groq (cloud, free tier)"
                  onClick={() => {
                    update('customBaseUrl', 'https://api.groq.com/openai/v1', true)
                    update('customModel', 'llama-3.3-70b-versatile', true)
                  }}
                />
                <PresetButton
                  label="🔀 OpenRouter"
                  onClick={() => {
                    update('customBaseUrl', 'https://openrouter.ai/api/v1', true)
                    update('customModel', 'openai/gpt-4o-mini', true)
                  }}
                />
              </div>
              <Field
                label="Base URL"
                hint="OpenAI-compatible endpoint. For Ollama use http://localhost:11434/v1"
              >
                <input
                  type="text"
                  value={settings.customBaseUrl}
                  onChange={(e) => update('customBaseUrl', e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none font-mono text-xs"
                />
              </Field>
              <Field
                label="API Key (optional for local)"
                hint="Ollama/LM Studio: any string works. Groq/OpenRouter: real key required."
              >
                <input
                  type="password"
                  value={settings.customApiKey}
                  onChange={(e) => update('customApiKey', e.target.value)}
                  placeholder="ollama (or your key)"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
                />
              </Field>
              <Field
                label="Model name"
                hint="Exact model id. Ollama: llama3.1:8b, qwen2.5:7b. Groq: llama-3.3-70b-versatile."
              >
                <input
                  type="text"
                  value={settings.customModel}
                  onChange={(e) => update('customModel', e.target.value)}
                  placeholder="llama3.1:8b"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none font-mono text-xs"
                />
              </Field>
            </div>
          )}
        </section>
        )}

        {activeSection === 'behavior' && (
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
          {settings.llmProvider === 'anthropic' && (
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
          )}
          {settings.llmProvider === 'openai' && (
            <Field
              label="OpenAI model"
              hint="gpt-4o-mini is fastest and cheapest. gpt-4o for higher quality."
            >
              <select
                value={settings.openaiModel}
                onChange={(e) => update('openaiModel', e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 focus:border-accent outline-none"
              >
                <option value="gpt-4o-mini">GPT-4o mini (fast, cheap)</option>
                <option value="gpt-4.1-mini">GPT-4.1 mini (newer, similar)</option>
                <option value="gpt-4o">GPT-4o (higher quality)</option>
              </select>
            </Field>
          )}
          {/* Custom model field is shown in the API Keys section block above */}
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
        )}

        {activeSection === 'recording' && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Recording & saving
          </h2>
          <p className="text-xs text-white/50 -mt-1">
            Optional add-ons. Enable as per your workflow.
          </p>

          <Toggle
            label="Record audio (save .webm locally)"
            hint="Saves a mixed audio file of both sides to your computer. Nothing uploaded."
            value={settings.featureRecordAudio}
            onChange={(v) => update('featureRecordAudio', v)}
          />
          <Toggle
            label="Record full meeting video (screen + audio)"
            hint="Saves the shared screen + mixed audio as a .webm video. Larger file (~50 MB / 30 min at 720p). Nothing uploaded."
            value={settings.featureRecordVideo}
            onChange={(v) => update('featureRecordVideo', v)}
          />
          <Toggle
            label="Save transcript after call (.txt)"
            hint="Saves a plain-text transcript with speaker labels and timestamps."
            value={settings.featureSaveTranscript}
            onChange={(v) => update('featureSaveTranscript', v)}
          />
          <Toggle
            label="Generate AI summary after call (.txt)"
            hint="At end of call, the AI produces a structured summary: key points, action items, sentiment, follow-ups."
            value={settings.featureGenerateSummary}
            onChange={(v) => update('featureGenerateSummary', v)}
          />
          <Toggle
            label="Also save markdown (.md) versions"
            hint="Power-user mode — saves a .md copy alongside the .txt for tools like Notion / Obsidian. Off by default."
            value={settings.saveMarkdownToo}
            onChange={(v) => update('saveMarkdownToo', v)}
          />
        </section>
        )}

        {activeSection === 'savefolder' && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Save folder
          </h2>
          <p className="text-xs text-white/50 -mt-1">
            Where call artifacts are stored on your computer.
          </p>
          <div className="rounded-lg bg-white/[0.03] border border-white/10 p-3 text-xs space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">
              Folder structure
            </div>
            <div className="font-mono text-white/70 leading-relaxed">
              <div>📁 your-folder/</div>
              <div className="pl-4">📁 2026-05-26_14-30_Meet/</div>
              <div className="pl-8 text-white/50">🎙 recording.webm</div>
              <div className="pl-8 text-white/50">📄 transcript.txt</div>
              <div className="pl-8 text-white/50">📋 summary.txt</div>
              <div className="pl-4 text-white/40">📁 2026-05-26_15-45_Meet/ …</div>
            </div>
            <div className="text-white/40 pt-1">
              Every call gets its own dated folder. Recording, transcript, and summary stay
              together.
            </div>
          </div>
          <div className="rounded-lg bg-white/5 border border-white/10 p-4 text-xs space-y-3">
            <div className="text-white/60 uppercase tracking-wider font-semibold text-[10px]">
              Current location
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
        )}

        {activeSection === 'speakers' && (
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
        )}

        {activeSection === 'prompt' && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            System Prompt
          </h2>
          <p className="text-xs text-white/50">
            The full instruction set the AI uses for every suggestion. Paste objection handling
            scripts, product details, FAQs, tone guidelines — anything you want the AI to know.
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
        )}
        </div>
      </main>
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

function PresetButton({
  label,
  onClick
}: {
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 text-white/80 hover:text-white px-3 py-1.5 rounded-md transition-colors"
    >
      {label}
    </button>
  )
}

function BigToggle({
  icon,
  label,
  hint,
  value,
  onChange
}: {
  icon: string
  label: string
  hint: string
  value: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`text-left p-4 rounded-xl border-2 transition-all ${
        value
          ? 'bg-accent/10 border-accent/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
          : 'bg-white/5 border-white/10 hover:border-white/25 hover:bg-white/[0.07]'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 leading-none mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="text-sm font-semibold">{label}</span>
            <span
              className={`relative inline-block w-9 h-5 rounded-full transition-colors shrink-0 ${
                value ? 'bg-accent' : 'bg-white/20'
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                  value ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </span>
          </div>
          <p className="text-xs text-white/50 leading-snug">{hint}</p>
        </div>
      </div>
    </button>
  )
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
