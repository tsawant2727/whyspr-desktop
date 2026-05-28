import { DEFAULT_PLAYBOOKS, DEFAULT_TELECONSULTATION_PLAYBOOK, type Playbook } from './playbooks'

export type LlmProvider = 'anthropic' | 'openai' | 'custom'

export type SttProvider = 'deepgram' | 'groq'

export type AppSettings = {
  deepgramApiKey: string
  groqApiKey: string
  sttProvider: SttProvider
  anthropicApiKey: string
  openaiApiKey: string
  llmProvider: LlmProvider
  // Custom OpenAI-compatible endpoint (Ollama, LM Studio, Groq, OpenRouter, etc.)
  customBaseUrl: string // e.g. http://localhost:11434/v1
  customApiKey: string // optional — Ollama doesn't need one, cloud-compat APIs do
  customModel: string // free-text model id, e.g. llama3.1:8b
  systemPrompt: string
  // Per-call dynamic variables. Used to fill {{KEY}} placeholders inside
  // systemPrompt + patientContext before sending to the LLM. Edited from
  // the Settings → Prompt screen (and, eventually, auto-populated by the
  // team-RAG lookup_lead tool when team-managed mode lands).
  dynamicVariables: Record<string, string>
  // Optional short free-text description of THIS specific patient / client
  // (history, budget signal, family dynamics, prior agency contact, etc.).
  // Injected as an "ABOUT THIS PATIENT" section AFTER the main prompt rules
  // and BEFORE the transcript window. Cap is enforced in the UI at 500 chars.
  patientContext: string
  language: 'multi' | 'en' | 'hi'
  llmModel: string // Anthropic model id when llmProvider === 'anthropic'
  openaiModel: string // OpenAI model id when llmProvider === 'openai'
  suggestionTriggerSilenceMs: number
  // Feature toggles — each user picks what they need
  featureLiveSuggestions: boolean
  featureShowTranscript: boolean // show live transcript panel in overlay by default
  featureRecordAudio: boolean
  featureRecordVideo: boolean // captures screen + audio together (.webm)
  featureSaveTranscript: boolean
  featureGenerateSummary: boolean
  // Save markdown (.md) versions alongside .txt. Off by default — most users
  // only want plain text files.
  saveMarkdownToo: boolean
  // Free-text notes the user writes before a call (talking points, prices,
  // key facts). Persisted across sessions. Also injected into the LLM system
  // prompt so suggestions reference them.
  userNotes: string
  // Speaker labels (configurable per use case)
  speakerLabelMe: string // mic = "you / sales / agent / interviewer / doctor"
  speakerLabelThem: string // system audio = "patient / customer / candidate / client"
  // Custom save folder (empty = use default app data location)
  customRecordingsDir: string
  // Last applied template ID (empty = none, user is in custom mode)
  activeTemplateId: string
  // Call-flow playbooks — structured checklists shown in the overlay drawer
  // during a live session.
  playbooks: Playbook[]
  // Which playbook to load by default when a session starts. Empty = first
  // playbook in the list, or none if the list is empty.
  defaultPlaybookId: string
  // The most recent version the user dismissed the "Update available" banner
  // for. While this matches the latest version on the server, the banner
  // stays hidden. When the server publishes a NEWER version, the banner
  // returns. Empty = never dismissed anything.
  dismissedUpdateVersion: string
}

export type TranscriptSegment = {
  id: string
  speaker: 'sales' | 'patient' | 'unknown'
  text: string
  isFinal: boolean
  timestampMs: number
}

export type Suggestion = {
  id: string
  text: string
  triggeredByTranscriptId: string
  createdAtMs: number
  status: 'streaming' | 'done' | 'error'
}

export type IpcChannels = {
  'settings:get': () => AppSettings
  'settings:set': (settings: Partial<AppSettings>) => AppSettings
  'session:start': () => { ok: boolean; error?: string }
  'session:stop': () => void
  'session:audio-chunk': (chunk: ArrayBuffer) => void
  'session:request-suggestion': () => void
}

export type IpcEvents = {
  'transcript:update': TranscriptSegment
  'suggestion:update': Suggestion
  'session:status': { active: boolean; error?: string }
}

export const DEFAULT_SYSTEM_PROMPT = `You are a real-time conversation copilot. Your job: when the other person says something, suggest a short, natural reply (1-2 sentences max) the user can say back. Match the language and tone of the conversation.

How you help:
- Listen to what the other person just said
- Provide a clear, concise suggested response
- Use simple, conversational language
- Stay positive and constructive

Output format:
- Reply with ONLY the suggested response. No preamble, no "You could say...", no quotes.
- Keep it under 30 words.
- Match the language being used (English, Hindi, Hinglish, etc.)

Customize this prompt in Settings for your specific use case:
- Sales calls: product details, objection handling, pricing
- Customer support: troubleshooting steps, escalation rules
- Interviews: evaluation criteria, follow-up questions
- Consultations: domain knowledge, professional tone
- Tutoring: subject matter, teaching style`

export const DEFAULT_SETTINGS: AppSettings = {
  deepgramApiKey: '',
  groqApiKey: '',
  sttProvider: 'deepgram',
  anthropicApiKey: '',
  openaiApiKey: '',
  llmProvider: 'anthropic',
  customBaseUrl: 'http://localhost:11434/v1',
  customApiKey: 'ollama',
  customModel: 'llama3.1:8b',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  dynamicVariables: {},
  patientContext: '',
  language: 'multi',
  llmModel: 'claude-haiku-4-5-20251001',
  openaiModel: 'gpt-4o-mini',
  suggestionTriggerSilenceMs: 1500,
  featureLiveSuggestions: true,
  featureShowTranscript: false,
  featureRecordAudio: false,
  featureRecordVideo: false,
  featureSaveTranscript: false,
  featureGenerateSummary: false,
  saveMarkdownToo: false,
  userNotes: '',
  speakerLabelMe: 'You',
  speakerLabelThem: 'Other',
  customRecordingsDir: '',
  activeTemplateId: '',
  // Seed with the CME TeleConsultation playbook so first-time users see a
  // realistic example. They can edit / delete it from Settings.
  playbooks: DEFAULT_PLAYBOOKS,
  defaultPlaybookId: DEFAULT_TELECONSULTATION_PLAYBOOK.id,
  dismissedUpdateVersion: ''
}

export type CallArtifacts = {
  callId: string
  startedAt: number
  endedAt: number
  recordingPath?: string
  transcriptTxtPath?: string
  transcriptMdPath?: string
  summaryTxtPath?: string
  summaryMdPath?: string
  recordingsDir: string
}
