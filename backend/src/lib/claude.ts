import Anthropic from '@anthropic-ai/sdk';
import type { EventCard } from './schema.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const DIGEST_TTL_SECONDS = 2 * 60 * 60;

interface CountryContext {
  name: string;
  code: string;
  in_conflict: boolean;
  stability_score: number;
}

const FALLBACK_EVENTS: EventCard[] = [
  { summary: 'Intelligence digest unavailable — API key not configured. Set ANTHROPIC_API_KEY in backend/.env to enable live briefings.' },
];

export async function generateDigest(country: CountryContext): Promise<EventCard[]> {
  const conflictContext = country.in_conflict
    ? 'The country is currently engaged in active armed conflict.'
    : 'The country is not engaged in active armed conflict.';

  const prompt = `You are a news analyst. Write exactly 2 event cards about recent developments in ${country.name} (${country.code}).

Context: ${conflictContext} Stability Index: ${country.stability_score}/100.

Return ONLY a JSON array with exactly 2 objects. No other text, no markdown, no code fences.

[
  { "summary": "2-3 sentence description of a specific current event or development." },
  { "summary": "2-3 sentence description of a different current event or development." }
]

Requirements:
- Be specific and factual about real, current events
- Each summary is 2-3 sentences only
- Focus on concrete developments, not background context`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

  // Parse and validate JSON — reject on malformed output
  const parsed = JSON.parse(content.text.trim());
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Claude returned unexpected structure');
  }

  return parsed
    .slice(0, 3)
    .map((item: unknown) => {
      if (typeof item !== 'object' || item === null || !('summary' in item)) {
        throw new Error('Malformed event card from Claude');
      }
      return { summary: String((item as Record<string, unknown>).summary) };
    });
}

export { FALLBACK_EVENTS };
