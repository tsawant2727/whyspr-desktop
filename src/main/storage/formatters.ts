import { TranscriptSegment } from '../../shared/types'

/**
 * Format a transcript as clean plain text — readable by anyone, no markdown
 * symbols, universal compatibility.
 */
export function formatTranscriptTxt(
  callId: string,
  transcript: TranscriptSegment[],
  meLabel: string,
  themLabel: string
): string {
  const startTs = transcript[0]?.timestampMs ?? Date.now()
  const lines: string[] = [
    'CALL TRANSCRIPT',
    '═══════════════',
    '',
    `Call ID:  ${callId}`,
    `Started:  ${new Date(startTs).toLocaleString()}`,
    `Duration: ${formatDuration(transcript)}`,
    '',
    '─────────────────────────────────────────',
    ''
  ]

  for (const seg of transcript) {
    if (!seg.isFinal) continue
    const label =
      seg.speaker === 'sales' ? meLabel : seg.speaker === 'patient' ? themLabel : 'UNKNOWN'
    const time = new Date(seg.timestampMs).toLocaleTimeString()
    lines.push(`[${time}] ${label.toUpperCase()}:`)
    lines.push(seg.text)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Convert markdown summary to clean plain text. Strips markdown syntax,
 * keeps structure visible via spacing and uppercase headers.
 */
export function summaryMdToTxt(md: string): string {
  return md
    .replace(/^#{1,6}\s+(.+)$/gm, (_, heading: string) => {
      const upper = heading.toUpperCase()
      return `${upper}\n${'─'.repeat(Math.min(upper.length, 40))}`
    })
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/^- \[ \] /gm, '○ ')
    .replace(/^- \[x\] /gim, '● ')
    .replace(/^- /gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatDuration(transcript: TranscriptSegment[]): string {
  if (transcript.length < 2) return '—'
  const first = transcript[0].timestampMs
  const last = transcript[transcript.length - 1].timestampMs
  const seconds = Math.floor((last - first) / 1000)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}
