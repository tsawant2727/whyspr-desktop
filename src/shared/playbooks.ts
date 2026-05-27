/**
 * Playbooks — structured call-flow checklists the user can reference and
 * tick off during a live conversation.
 *
 * Data shape:
 *   Playbook
 *   ├── id, name, optional description
 *   └── phases[]
 *       ├── id, title, optional description
 *       └── steps[]
 *           ├── id, title
 *           └── optional details / sub-bullets (rendered under the step)
 *
 * During a session, the renderer tracks `doneStepIds` in local state. It
 * resets when a new session starts — playbook state is per-meeting, not
 * persistent (intentional: each call gets a fresh checklist).
 */

export type PlaybookStep = {
  id: string
  title: string
  /** Optional one-liner shown under the step in muted text. */
  details?: string
}

export type PlaybookPhase = {
  id: string
  title: string
  /** Optional caption shown under the phase title. */
  description?: string
  steps: PlaybookStep[]
}

export type Playbook = {
  id: string
  name: string
  description?: string
  phases: PlaybookPhase[]
  /** Wall-clock timestamps for ordering / "last edited" displays. */
  createdAtMs: number
  updatedAtMs: number
}

/**
 * Seeded default playbook — the CME TeleConsultation Flow.
 * Users see this on first launch; they can edit/duplicate/delete freely.
 */
export const DEFAULT_TELECONSULTATION_PLAYBOOK: Playbook = {
  id: 'pb_teleconsult_default',
  name: 'TeleConsultation Flow',
  description:
    'Frame the surgeon, walk the platform, reveal the estimate, close confidently.',
  createdAtMs: Date.UTC(2026, 4, 1),
  updatedAtMs: Date.UTC(2026, 4, 1),
  phases: [
    {
      id: 'ph_open_qualify',
      title: 'Phases 1 & 2 — Open & Qualify',
      steps: [
        {
          id: 's_intro_surgeon',
          title: 'Introduce the surgeon',
          details:
            'Surgeon has already reviewed their pictures, say this first. Frame: "By the end, you will know everything before booking a life-changing surgery." Advisory tone, not sales.'
        },
        {
          id: 's_post_debrief',
          title: 'Post-surgeon debrief',
          details:
            'Ask: "How was that for you?" Listen fully. Their tone tells you everything.'
        },
        {
          id: 's_travel_timeline',
          title: 'Travel timeline — lever ID',
          details:
            '"Have you thought about when you would like to travel?" Tight = urgency. Flexible = nurture.'
        }
      ]
    },
    {
      id: 'ph_show_platform',
      title: 'Phase 3 — Show the Platform & Team',
      steps: [
        {
          id: 's_surprise',
          title: 'The surprise — screen share',
          details:
            '"I have something special for the second half." Ask permission.'
        },
        {
          id: 's_walk_portal',
          title: 'Walk the patient portal',
          details:
            '"No other agency uses anything like this." Show medical history, document upload, real-time surgeon access.'
        },
        {
          id: 's_show_hospital',
          title: 'Show the hospital',
          details: 'Walk accreditations, facilities, outcomes.'
        },
        {
          id: 's_show_surgeon',
          title: 'Show the surgeon',
          details: 'Training, specialisation, results, reviews.'
        },
        {
          id: 's_estimate_reveal',
          title: 'The estimate reveal',
          details:
            '"Your negotiated estimates are already received." Walk inclusions: Airport transfers · Surgeon & anaesthesiologist · Pre-op blood work · Private room + companion · Extra nights · Complication cover.'
        }
      ]
    },
    {
      id: 'ph_golden_pause',
      title: 'Phase 5 — The Golden Pause',
      description: 'Critical for patient decision-making. Allow ample space.',
      steps: [
        {
          id: 's_share_number',
          title: 'Share the number',
          details: 'Say it once. Clearly.'
        },
        {
          id: 's_stop_talking',
          title: 'Stop talking',
          details: 'Not even filler. Wait.'
        },
        {
          id: 's_let_them_react',
          title: 'Let them react',
          details: 'Silence is your best close.'
        }
      ]
    },
    {
      id: 'ph_objections_close',
      title: 'Phase 6 — Handle Objections & Close',
      steps: [
        {
          id: 's_thoughts',
          title: 'Thoughts?',
          details: 'Ask open-ended. Listen fully.'
        },
        {
          id: 's_objection_frame',
          title: 'Objection: Acknowledge + Reframe + Evidence + Confirm',
          details: 'Never argue.'
        },
        {
          id: 's_offer',
          title: 'The offer — time-sensitive, one ask'
        },
        {
          id: 's_blocker',
          title: 'Blocker',
          details:
            '"What specifically is stopping you from moving forward today?"'
        },
        {
          id: 's_next_action',
          title: 'Next action',
          details: 'Confirm exact date, time, next step.'
        },
        {
          id: 's_summarise',
          title: 'Summarise',
          details: 'Recap 3 key points. Send WhatsApp recap.'
        }
      ]
    }
  ]
}

export const DEFAULT_PLAYBOOKS: Playbook[] = [DEFAULT_TELECONSULTATION_PLAYBOOK]

/**
 * Count all steps in a playbook — used for progress display.
 */
export function totalStepsInPlaybook(pb: Playbook): number {
  return pb.phases.reduce((sum, p) => sum + p.steps.length, 0)
}

/**
 * Generate a stable-ish id with a short random suffix. Used when the user
 * creates new playbooks / phases / steps in the Settings editor.
 */
export function makePlaybookId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
