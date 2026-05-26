import Anthropic from '@anthropic-ai/sdk'
import { TranscriptSegment } from '../../shared/types'

export async function generateSummary(
  opts: {
    apiKey: string
    model: string
    transcript: TranscriptSegment[]
    meLabel: string
    themLabel: string
  }
): Promise<string> {
  const client = new Anthropic({ apiKey: opts.apiKey })

  const conversation = opts.transcript
    .filter((s) => s.isFinal)
    .map((s) => {
      const label =
        s.speaker === 'sales' ? opts.meLabel : s.speaker === 'patient' ? opts.themLabel : 'Unknown'
      return `${label}: ${s.text}`
    })
    .join('\n')

  const message = await client.messages.create({
    model: opts.model,
    max_tokens: 1500,
    system: `You are a meeting summarizer. Given a conversation transcript, produce a structured markdown summary.

Format your response in this exact structure:

## Summary
2-3 sentence overview of the call.

## Key Points Discussed
- Bullet points of main topics covered

## Decisions / Outcomes
- Any commitments, agreements, next steps mentioned
- If none, write "None recorded."

## Action Items
- [ ] Specific tasks with who's responsible (if mentioned)
- If none, write "None recorded."

## Concerns / Objections Raised
- What the other party pushed back on or asked about
- If none, write "None recorded."

## Sentiment
Overall tone of the conversation (positive / neutral / mixed / negative) with a brief reason.

## Recommended Follow-up
1-2 sentences on what the user should do next based on this call.

Be concise. Use the same language as the conversation (Hindi/English/Hinglish OK).`,
    messages: [
      {
        role: 'user',
        content: `Here is the call transcript:\n\n${conversation}\n\nPlease summarize it in the format specified.`
      }
    ]
  })

  const textBlock = message.content.find((c) => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }
  return textBlock.text
}
