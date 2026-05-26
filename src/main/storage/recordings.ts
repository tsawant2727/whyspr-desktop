import { app, shell } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { TranscriptSegment } from '../../shared/types'
import { getSettings } from '../store/settings'
import { formatTranscriptTxt, summaryMdToTxt } from './formatters'

export function getRecordingsDir(): string {
  const custom = getSettings().customRecordingsDir
  if (custom && custom.trim().length > 0) {
    return custom
  }
  return join(app.getPath('userData'), 'recordings')
}

export async function ensureRecordingsDir(): Promise<string> {
  const dir = getRecordingsDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/**
 * Generate a human-friendly call identifier used as the per-call folder name.
 * Format: 2026-05-26_14-30_Meet — sortable, readable, no spaces.
 */
export function makeCallId(): string {
  const d = new Date()
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}_Meet`
}

/**
 * Each call gets its own subfolder under the base recordings dir. All
 * artifacts (recording, transcript, summary) live together inside it.
 */
async function ensureCallFolder(callId: string): Promise<string> {
  const base = await ensureRecordingsDir()
  const folder = join(base, callId)
  await fs.mkdir(folder, { recursive: true })
  return folder
}

export async function saveRecording(
  callId: string,
  data: Buffer,
  mimeType: string
): Promise<string> {
  const folder = await ensureCallFolder(callId)
  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('opus') ? 'opus' : 'audio'
  const filePath = join(folder, `recording.${ext}`)
  await fs.writeFile(filePath, data)
  return filePath
}

/**
 * Save transcript. Always writes .txt. Also writes .md if saveMarkdownToo
 * setting is enabled.
 */
export async function saveTranscript(
  callId: string,
  transcript: TranscriptSegment[],
  meLabel: string,
  themLabel: string
): Promise<{ txt: string; md?: string }> {
  const folder = await ensureCallFolder(callId)
  const { saveMarkdownToo } = getSettings()

  const txtPath = join(folder, `transcript.txt`)
  const txtContent = formatTranscriptTxt(callId, transcript, meLabel, themLabel)
  await fs.writeFile(txtPath, txtContent, 'utf8')

  if (!saveMarkdownToo) {
    return { txt: txtPath }
  }

  const mdPath = join(folder, `transcript.md`)
  const startTs = transcript[0]?.timestampMs ?? Date.now()
  const mdLines: string[] = [
    `# Call Transcript`,
    ``,
    `**Call:** ${callId}`,
    `**Started:** ${new Date(startTs).toLocaleString()}`,
    ``,
    `---`,
    ``
  ]
  for (const seg of transcript) {
    if (!seg.isFinal) continue
    const label =
      seg.speaker === 'sales' ? meLabel : seg.speaker === 'patient' ? themLabel : 'Unknown'
    const time = new Date(seg.timestampMs).toLocaleTimeString()
    mdLines.push(`**${label}** _(${time})_`)
    mdLines.push(seg.text)
    mdLines.push(``)
  }
  await fs.writeFile(mdPath, mdLines.join('\n'), 'utf8')

  return { txt: txtPath, md: mdPath }
}

/**
 * Save summary. Always writes .txt. Also writes .md if saveMarkdownToo
 * setting is enabled.
 */
export async function saveSummary(
  callId: string,
  summaryMarkdown: string
): Promise<{ txt: string; md?: string }> {
  const folder = await ensureCallFolder(callId)
  const { saveMarkdownToo } = getSettings()

  const txtPath = join(folder, `summary.txt`)
  const txtContent = `MEETING SUMMARY\n═══════════════\n\nCall: ${callId}\nGenerated: ${new Date().toLocaleString()}\n\n${'─'.repeat(40)}\n\n${summaryMdToTxt(summaryMarkdown)}\n`
  await fs.writeFile(txtPath, txtContent, 'utf8')

  if (!saveMarkdownToo) {
    return { txt: txtPath }
  }

  const mdPath = join(folder, `summary.md`)
  await fs.writeFile(mdPath, summaryMarkdown, 'utf8')
  return { txt: txtPath, md: mdPath }
}

export async function openRecordingsFolder(): Promise<void> {
  const dir = await ensureRecordingsDir()
  await shell.openPath(dir)
}

export async function openFile(filePath: string): Promise<void> {
  await shell.openPath(filePath)
}
