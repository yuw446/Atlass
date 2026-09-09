// Cloudflare Worker: a punctual cron that asks GitHub to run the tick workflow.
// GitHub's own schedule dropped 42 of 44 runs on the first night; Cloudflare crons fire to the minute.
// Fires at :02, :17, :32, :47 so GDELT has two minutes to finish publishing the quarter-hour batch.

export interface Env {
  GITHUB_TOKEN: string;          // fine-grained PAT, "Actions: write" on yuw446/Atlass only (wrangler secret)
  REPO: string;                  // "yuw446/Atlass"
  WORKFLOW: string;              // "tick.yml"
  REF: string;                   // "main"
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(dispatch(env));
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
  // 204 = queued. Anything else is worth seeing in `wrangler tail`.
  console.log(`dispatch ${env.WORKFLOW}@${env.REF}: HTTP ${res.status}${res.status === 204 ? '' : ' ' + (await res.text()).slice(0, 200)}`);
}
