import Store from 'electron-store'
import { AppSettings, DEFAULT_SETTINGS } from '../../shared/types'
import { getTemplate } from '../../shared/templates'

const store = new Store<AppSettings>({
  name: 'sales-copilot-settings',
  defaults: DEFAULT_SETTINGS,
  encryptionKey: 'sales-copilot-local-v1'
})

/**
 * Read all settings. Walks every key in DEFAULT_SETTINGS so new fields added
 * to the AppSettings type are automatically included with their defaults —
 * no need to update this function when adding settings.
 */
export function getSettings(): AppSettings {
  const result = {} as AppSettings
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const defaultValue = DEFAULT_SETTINGS[key]
    // @ts-expect-error dynamic key read into typed store
    const value = store.get(key, defaultValue)
    // @ts-expect-error dynamic key write into typed result
    result[key] = value
  }
  return result
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      // @ts-expect-error dynamic key write into typed store
      store.set(key, value)
    }
  }
  return getSettings()
}

/**
 * Apply a template by ID. Overwrites system prompt, speaker labels, and
 * recommended features. Keeps API keys, language, model, and custom paths
 * untouched.
 */
export function applyTemplate(templateId: string): AppSettings {
  const tpl = getTemplate(templateId)
  if (!tpl) throw new Error(`Unknown template: ${templateId}`)

  store.set('systemPrompt', tpl.systemPrompt)
  store.set('speakerLabelMe', tpl.speakerLabelMe)
  store.set('speakerLabelThem', tpl.speakerLabelThem)
  store.set('featureLiveSuggestions', tpl.features.featureLiveSuggestions)
  store.set('featureRecordAudio', tpl.features.featureRecordAudio)
  store.set('featureSaveTranscript', tpl.features.featureSaveTranscript)
  store.set('featureGenerateSummary', tpl.features.featureGenerateSummary)
  store.set('activeTemplateId', templateId)

  return getSettings()
}
