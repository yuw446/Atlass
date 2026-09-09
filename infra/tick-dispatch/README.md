# tick-dispatch

A Cloudflare Worker with one job: every 15 minutes, ask GitHub to run `tick.yml`. GitHub's own `schedule` trigger
dropped 42 of the first 44 runs on this private repo, so something punctual has to press the button.

**The clock is a Durable Object alarm, not a Cron Trigger.** On this account Cloudflare's cron registered fine and
never invoked `scheduled()` once (a documented, ongoing Cloudflare fault in 2026; see the gotchas below). Alarms are a
separate scheduler and fire to the second. One object holds one alarm; `alarm()` re-arms the next quarter hour
before it dispatches, so a failed dispatch cannot break the chain. The cron trigger stays in `wrangler.toml` only as
a re-arm path if it ever comes alive. Firing minutes are :02, :17, :32, :47, two minutes after GDELT's batch.

Endpoints on `https://atlas-tick-dispatch.yuw446-atlas.workers.dev`:
- `/arm` arms the alarm if none is set. Idempotent and harmless: it never dispatches by itself, so it needs no secret.
- `/status` shows when the next alarm rings.
- anything else: 404.

## Deploy (once, about ten minutes)

1. Create a fine-grained personal access token at https://github.com/settings/personal-access-tokens/new:
   repository access **only `yuw446/Atlass`**, permission **Actions: Read and write**, nothing else. Copy it.
2. From this directory:
   ```bash
   npx wrangler login                     # opens the browser; free Cloudflare account is enough
   npx wrangler secret put GITHUB_TOKEN   # paste the token; it is stored encrypted, never in git
   npx wrangler deploy
   curl https://atlas-tick-dispatch.yuw446-atlas.workers.dev/arm
   ```
3. Check it fires: a `workflow_dispatch` run should appear at https://github.com/yuw446/Atlass/actions/workflows/tick.yml
   within a minute of the next :02, :17, :32 or :47. `/status` shows the next alarm. Persisted logs
   (dashboard → Workers & Pages → atlas-tick-dispatch → Logs) show one line per dispatch with the HTTP status; 204 means queued.

If the chain ever stops (`/status` says "not armed"), hit `/arm` once. The token can be revoked at any time from the
GitHub settings page; the worker then logs HTTP 401 and does nothing.

## Gotchas seen on first deploy (2026-09-09)

- Cloudflare's scheduling API rejects cron triggers until the *account* has a workers.dev subdomain (error 10063).
  Register it once, on the dashboard's Workers page or via `PUT /accounts/{id}/workers/subdomain {"subdomain": "…"}`.
- Cron Triggers on this new account were registered and listed by `/schedules` but never invoked the worker
  (four consecutive firings, zero invocations in `workersInvocationsAdaptive`, while an HTTP handler running the same
  code worked). Community reports from 2026 describe the same signature. Hence the alarm.
- `wrangler secret put` before the first deploy asks to create the worker; answer Y. The secret survives later deploys.

## Cost

Free tier: Workers 100,000 requests a day, Durable Objects included. This uses 96 alarms and 96 dispatches a day.
