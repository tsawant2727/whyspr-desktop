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

export function makeCallId(): string {
  const d = new Date()
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export async function saveRecording(
  callId: string,
  data: Buffer,
  mimeType: string
): Promise<string> {
  const dir = await ensureRecordingsDir()
  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('opus') ? 'opus' : 'audio'
  const filePath = join(dir, `${callId}.${ext}`)
  await fs.writeFile(filePath, data)
  return filePath
}

/**
 * Save transcript in BOTH .txt and .md formats so users can pick what they prefer.
 * .txt for normal users, .md for power users (Notion/Obsidian/Bear etc.)
 */
export async function saveTranscript(
  callId: string,
  transcript: TranscriptSegment[],
  meLabel: string,
  themLabel: string
): Promise<{ txt: string; md: string }> {
  const dir = await ensureRecordingsDir()

  // .txt — clean plain text
  const txtPath = join(dir, `${callId}_transcript.txt`)
  const txtContent = formatTranscriptTxt(callId, transcript, meLabel, themLabel)
  await fs.writeFile(txtPath, txtContent, 'utf8')

  // .md — markdown with structure
  const mdPath = join(dir, `${callId}_transcript.md`)
  const startTs = transcript[0]?.timestampMs ?? Date.now()
  const mdLines: string[] = [
    `# Call Transcript`,
    ``,
    `**Call ID:** ${callId}`,
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
 * Save summary in BOTH formats. Input is markdown from Claude; we save the
 * markdown as-is and also generate a stripped-down .txt version.
 */
export async function saveSummary(
  callId: string,
  summaryMarkdown: string
): Promise<{ txt: string; md: string }> {
  const dir = await ensureRecordingsDir()

  const mdPath = join(dir, `${callId}_summary.md`)
  await fs.writeFile(mdPath, summaryMarkdown, 'utf8')

  const txtPath = join(dir, `${callId}_summary.txt`)
  const txtContent = `MEETING SUMMARY\n═══════════════\n\nCall ID: ${callId}\nGenerated: ${new Date().toLocaleString()}\n\n${'─'.repeat(40)}\n\n${summaryMdToTxt(summaryMarkdown)}\n`
  await fs.writeFile(txtPath, txtContent, 'utf8')

  return { txt: txtPath, md: mdPath }
}

export async function openRecordingsFolder(): Promise<void> {
  const dir = await ensureRecordingsDir()
  await shell.openPath(dir)
}

export async function openFile(filePath: string): Promise<void> {
  await shell.openPath(filePath)
}
