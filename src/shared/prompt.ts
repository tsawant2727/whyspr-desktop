/**
 * Prompt assembly — bring the template, dynamic variables and patient
 * context together into the final system prompt that goes to the LLM.
 *
 * Lives in `shared/` because both the main process (LLM clients) and the
 * renderer (settings UI: variable detection, preview) need the same logic.
 */

/** Matches `{{KEY}}` where KEY is uppercase letters, digits and underscores. */
const PLACEHOLDER_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g

/**
 * Replace every `{{KEY}}` in `template` with `vars[KEY]`. Per the prompt's
 * own rule ("if a placeholder is empty, just leave the name out — never
 * say the literal word 'patient'"), missing or empty vars collapse to ''.
 *
 * Whitespace around a collapsed placeholder is NOT trimmed — that's the
 * caller's job if they care about cleaning up "Hi , how are you?".
 */
export function substituteVariables(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(PLACEHOLDER_RE, (_, key) => {
    const v = vars[key]
    return typeof v === 'string' ? v : ''
  })
}

/**
 * Find every distinct `{{KEY}}` referenced in `template`. Used by the
 * Settings UI's "auto-detect from prompt" button to seed the variables
 * table without making the user list placeholders by hand.
 */
export function detectPlaceholders(template: string): string[] {
  const found = new Set<string>()
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    found.add(m[1])
  }
  return [...found].sort()
}

/**
 * Build the final system prompt for the LLM:
 *
 *   1. Main template with `{{...}}` substituted from `vars`.
 *   2. If `patientContext` is non-empty, append a dedicated section AFTER
 *      the rules so per-call context never gets buried inside the
 *      template's middle.
 *   3. `patientContext` itself also gets variable substitution so notes
 *      can reference `{{PATIENT_FIRST_NAME}}` etc.
 */
export function assembleSystemPrompt(opts: {
  template: string
  vars: Record<string, string>
  patientContext?: string
}): string {
  const main = substituteVariables(opts.template, opts.vars)
  const ctx = (opts.patientContext ?? '').trim()
  if (!ctx) return main

  const ctxRendered = substituteVariables(ctx, opts.vars)
  return `${main}

═══════════════════════════════════════════
## ABOUT THIS PATIENT (current session context)
═══════════════════════════════════════════

${ctxRendered}`
}
