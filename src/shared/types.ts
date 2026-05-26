export type LlmProvider = 'anthropic' | 'openai'

export type AppSettings = {
  deepgramApiKey: string
  anthropicApiKey: string
  openaiApiKey: string
  llmProvider: LlmProvider
  systemPrompt: string
  language: 'multi' | 'en' | 'hi'
  llmModel: string // Anthropic model id when llmProvider === 'anthropic'
  openaiModel: string // OpenAI model id when llmProvider === 'openai'
  suggestionTriggerSilenceMs: number
  // Feature toggles — each user picks what they need
  featureLiveSuggestions: boolean
  featureRecordAudio: boolean
  featureSaveTranscript: boolean
  featureGenerateSummary: boolean
  // Speaker labels (configurable per use case)
  speakerLabelMe: string // mic = "you / sales / agent / interviewer / doctor"
  speakerLabelThem: string // system audio = "patient / customer / candidate / client"
  // Custom save folder (empty = use default app data location)
  customRecordingsDir: string
  // Last applied template ID (empty = none, user is in custom mode)
  activeTemplateId: string
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
  anthropicApiKey: '',
  openaiApiKey: '',
  llmProvider: 'anthropic',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  language: 'multi',
  llmModel: 'claude-haiku-4-5-20251001',
  openaiModel: 'gpt-4o-mini',
  suggestionTriggerSilenceMs: 1500,
  featureLiveSuggestions: true,
  featureRecordAudio: false,
  featureSaveTranscript: false,
  featureGenerateSummary: false,
  speakerLabelMe: 'You',
  speakerLabelThem: 'Other',
  customRecordingsDir: '',
  activeTemplateId: ''
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
