import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 2-hour TTL for digest cache (in seconds)
export const DIGEST_TTL_SECONDS = 2 * 60 * 60;

interface CountryContext {
  name: string;
  code: string;
  stability_score: number;
  unrest_level: 0 | 1 | 2 | 3;
  top_events?: Array<{ headline: string; url?: string }>;
}

const UNREST_LABELS: Record<0 | 1 | 2 | 3, string> = {
  0: 'stable',
  1: 'low-level tension',
  2: 'elevated unrest',
  3: 'critical instability',
};

export async function generateDigest(country: CountryContext): Promise<string> {
  const eventsText = country.top_events?.length
    ? `\nKey recent developments:\n${country.top_events.map((e, i) => `${i + 1}. ${e.headline}`).join('\n')}`
    : '';

  const prompt = `You are a senior foreign correspondent writing a confidential intelligence brief.

Country: ${country.name} (${country.code})
Stability Index: ${country.stability_score}/100
Internal Situation: ${UNREST_LABELS[country.unrest_level]}${eventsText}

Write a 4-5 sentence intelligence brief for this country. Do not list facts mechanically — write in an editorial voice that explains WHY the situation is the way it is, what forces are driving it, and what is at stake. Focus on the underlying dynamics, not a summary of events. Tone: serious, precise, and slightly world-weary — like a veteran correspondent who has seen this pattern before.

Do not include a headline, dateline, or byline. Write only the body paragraph(s).`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');
  return content.text.trim();
}
