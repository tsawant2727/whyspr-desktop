import { useMemo, useState } from 'react'
import type { Playbook } from '../../../shared/playbooks'
import { totalStepsInPlaybook } from '../../../shared/playbooks'

/**
 * In-session checklist drawer. Shows the active playbook's phases & steps
 * with checkboxes. State (which steps are done, which playbook is active,
 * which phases are collapsed) is purely local — resets when the parent
 * component unmounts or when the user picks a new playbook.
 */
export function PlaybookDrawer({
  playbooks,
  initialActiveId,
  onClose
}: {
  playbooks: Playbook[]
  initialActiveId: string
  onClose: () => void
}): JSX.Element {
  // Pick the saved default if it still exists, otherwise the first playbook.
  const [activeId, setActiveId] = useState<string>(() => {
    if (initialActiveId && playbooks.some((p) => p.id === initialActiveId)) {
      return initialActiveId
    }
    return playbooks[0]?.id ?? ''
  })
  const active = useMemo(
    () => playbooks.find((p) => p.id === activeId) ?? null,
    [playbooks, activeId]
  )
  const [doneStepIds, setDoneStepIds] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const totalSteps = active ? totalStepsInPlaybook(active) : 0
  const doneCount = active
    ? active.phases.reduce(
        (sum, ph) => sum + ph.steps.filter((s) => doneStepIds.has(s.id)).length,
        0
      )
    : 0
  const percent = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0

  function toggleStep(id: string): void {
    setDoneStepIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePhase(phaseId: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(phaseId)) next.delete(phaseId)
      else next.add(phaseId)
      return next
    })
  }

  function resetAll(): void {
    setDoneStepIds(new Set())
  }

  function markPhaseDone(phaseId: string, allDone: boolean): void {
    if (!active) return
    const phase = active.phases.find((p) => p.id === phaseId)
    if (!phase) return
    setDoneStepIds((prev) => {
      const next = new Set(prev)
      if (allDone) {
        // un-tick all in this phase
        for (const s of phase.steps) next.delete(s.id)
      } else {
        for (const s of phase.steps) next.add(s.id)
      }
      return next
    })
  }

  return (
    <div className="no-drag flex flex-col h-full bg-slate-950/60 backdrop-blur-xl border-l border-white/10">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-white/55 font-semibold">
            Playbook
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/45 hover:text-white text-sm leading-none px-1"
            aria-label="Close playbook"
          >
            ×
          </button>
        </div>
        {playbooks.length > 1 ? (
          <select
            value={activeId}
            onChange={(e) => {
              setActiveId(e.target.value)
              setDoneStepIds(new Set())
              setCollapsed(new Set())
            }}
            className="w-full bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-sm focus:border-emerald-500 outline-none"
          >
            {playbooks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-sm font-semibold truncate">
            {active?.name ?? '(no playbook)'}
          </div>
        )}
        {active?.description && (
          <div className="text-[10px] text-white/45 mt-1 line-clamp-2">
            {active.description}
          </div>
        )}

        {/* Progress */}
        {active && totalSteps > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-white/55 mb-1">
              <span>
                {doneCount} / {totalSteps} done
              </span>
              <button
                type="button"
                onClick={resetAll}
                disabled={doneCount === 0}
                className="text-white/40 hover:text-white disabled:opacity-30"
              >
                Reset
              </button>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3">
        {!active && (
          <div className="text-center text-xs text-white/40 px-4 py-8">
            No playbook configured. Add one in{' '}
            <span className="text-white/65">Settings → Playbooks</span>.
          </div>
        )}
        {active?.phases.map((phase) => {
          const phaseDone = phase.steps.length > 0 && phase.steps.every((s) => doneStepIds.has(s.id))
          const phaseProgress = phase.steps.filter((s) => doneStepIds.has(s.id)).length
          const isCollapsed = collapsed.has(phase.id)
          return (
            <div key={phase.id} className="rounded-lg border border-white/5 bg-white/[0.02]">
              <button
                type="button"
                onClick={() => togglePhase(phase.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.03] rounded-t-lg"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white/90 truncate">
                    {phase.title}
                  </div>
                  {phase.description && !isCollapsed && (
                    <div className="text-[10px] text-white/45 mt-0.5">{phase.description}</div>
                  )}
                </div>
                <span className="text-[10px] text-white/45 shrink-0">
                  {phaseProgress}/{phase.steps.length}
                </span>
                <span className="text-white/35 text-xs">{isCollapsed ? '▸' : '▾'}</span>
              </button>
              {!isCollapsed && (
                <div className="px-1 pb-2">
                  {phase.steps.map((step) => {
                    const done = doneStepIds.has(step.id)
                    return (
                      <label
                        key={step.id}
                        className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggleStep(step.id)}
                          className="mt-0.5 accent-emerald-500 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-xs leading-snug ${
                              done ? 'text-white/40 line-through' : 'text-white/90'
                            }`}
                          >
                            {step.title}
                          </div>
                          {step.details && (
                            <div
                              className={`text-[10px] mt-0.5 leading-snug ${
                                done ? 'text-white/25' : 'text-white/50'
                              }`}
                            >
                              {step.details}
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                  {phase.steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => markPhaseDone(phase.id, phaseDone)}
                      className="text-[10px] text-white/35 hover:text-white/75 px-2 py-1"
                    >
                      {phaseDone ? '↺ Uncheck phase' : '✓ Check entire phase'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
