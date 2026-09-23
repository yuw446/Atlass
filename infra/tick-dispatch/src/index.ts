// Cloudflare Worker: a punctual clock that asks GitHub to run the tick workflow once an hour.
//
// GitHub's own `schedule:` dropped 42 of the first 44 runs. The clock is a Durable Object alarm: one object, one
// alarm at a time, re-armed from inside alarm() before the dispatch so a failed dispatch can never break the chain.
// Cloudflare's Cron Trigger is on the same grid but is NOT a second clock: it only re-arms the alarm if the chain
// has died (it slept through its first six hours on this account, then came alive on 2026-09-09 and dispatched
// from here as well, doubling the Actions bill until this fix was deployed). Only alarm() dispatches.
// Fires at :02 each hour so GDELT has two minutes to finish publishing the :00 batch; the tick catches up on the three
// quarter-hour batches before it. Hourly since 2026-09-23: at 96 runs a day the Actions minutes ran out on 2026-09-16.
//
// GET /arm      arms the alarm if none is set or the one set is more than five minutes overdue (idempotent, harmless, no secret needed)
// GET /status   shows when the next alarm rings
// anything else 404

import { DurableObject } from 'cloudflare:workers';

export interface Env {
  GITHUB_TOKEN: string;          // fine-grained PAT, "Actions: write" on yuw446/Atlass only (wrangler secret)
  REPO: string;                  // "yuw446/Atlass"
  WORKFLOW: string;              // "tick.yml"
  REF: string;                   // "main"
  TICKER: DurableObjectNamespace<Ticker>;
}

const MINUTE = 2;
const STALE_MS = 5 * 60_000;   // an alarm this far overdue is a dead chain too (delivery stuck), not a live one

/** Next firing at hh:02 UTC, at least 20 s after `now`. */
export function nextFire(now: Date): Date {
  const t = new Date(now); t.setUTCMinutes(MINUTE, 0, 0);
  if (t.getTime() - now.getTime() < 20_000) t.setUTCHours(t.getUTCHours() + 1);
  return t;
}

export class Ticker extends DurableObject<Env> {
  async arm(): Promise<string> {
    const current = await this.ctx.storage.getAlarm();
    if (current !== null && current > Date.now() - STALE_MS) return `armed for ${new Date(current).toISOString()}`;
    const t = nextFire(new Date());   // setAlarm replaces, so re-arming over a stale alarm can never double-fire
    await this.ctx.storage.setAlarm(t.getTime());
    console.log(`re-armed: next ${t.toISOString()}`);  // quiet while the chain is alive; one line when the cron or /arm repairs it
    return `armed for ${t.toISOString()}`;
  }

  async status(): Promise<string> {
    const current = await this.ctx.storage.getAlarm();
    return current === null ? 'not armed' : `next ${new Date(current).toISOString()}`;
  }

  async alarm(): Promise<void> {
    // Re-arm first: the chain must survive a failed dispatch. Alarms retry on throw, so any exception below is fine.
    await this.ctx.storage.setAlarm(nextFire(new Date()).getTime());
    await dispatch(this.env);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    const ticker = env.TICKER.get(env.TICKER.idFromName('singleton'));
    if (path === '/arm') return new Response(await ticker.arm());
    if (path === '/status') return new Response(await ticker.status());
    return new Response('not found', { status: 404 });
  },

  // Re-arm path only. arm() is a no-op while the chain is alive; if the alarm is gone, the next cron tick restores
  // it within 15 minutes (the cron stays on the quarter hours: invocations are free and repair comes sooner). Never dispatch from here: the alarm already did, 30 s ago, and a second run costs a
  // billed minute for a tick that finds nothing to publish.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const ticker = env.TICKER.get(env.TICKER.idFromName('singleton'));
    ctx.waitUntil(ticker.arm());
  },
};

async function dispatch(env: Env): Promise<void> {
  const url = `https://api.github.com/repos/${env.REPO}/actions/workflows/${env.WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'atlas-tick-dispatch',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: env.REF }),
  });
  // 204 = queued. Anything else is worth seeing in the worker's persisted logs.
  console.log(`dispatch ${env.WORKFLOW}@${env.REF}: HTTP ${res.status}${res.status === 204 ? '' : ' ' + (await res.text()).slice(0, 200)}`);
}
