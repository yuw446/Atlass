# tick-dispatch

A Cloudflare Worker with one job: once an hour, ask GitHub to run `tick.yml`. GitHub's own `schedule` trigger
dropped 42 of the first 44 runs while the repo was private, so something punctual has to press the button.

**The clock is a Durable Object alarm, not a Cron Trigger.** Alarms fire to the second. One object holds one alarm;
`alarm()` re-arms the next hour before it dispatches, so a failed dispatch cannot break the chain. The cron
trigger in `wrangler.toml` runs every 15 minutes but only calls `arm()`: a no-op while the chain is alive, and the
repair if the alarm is ever gone or more than five minutes overdue (no manual `/arm` needed). It must never dispatch; see the gotchas below for the
three days it did. The alarm fires at :02, two minutes after GDELT's :00 batch; the tick walks the three batches before
it too. It fired at :02, :17, :32, :47 until 2026-09-23; at 96 runs a day the Actions minutes ran out on 2026-09-16 (see the
repo's LIMITATIONS.md). The deployed worker keeps the old grid until `npx wrangler deploy` is run from this directory.

Endpoints on `https://atlas-tick-dispatch.yuw446-atlas.workers.dev`:
- `/arm` arms the alarm if none is set, or replaces one more than five minutes overdue. Idempotent and harmless: it
  never dispatches by itself, so it needs no secret.
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
   within a minute of the next :02. `/status` shows the next alarm. Persisted logs
   (dashboard → Workers & Pages → atlas-tick-dispatch → Logs) show one line per dispatch with the HTTP status; 204 means queued.

If the chain ever stops (`/status` says "not armed"), the next cron tick re-arms it within 15 minutes; `/arm` does the
same at once, and the persisted logs show `re-armed: next …` whenever either actually restores the chain. There is no
dashboard control for a Durable Object alarm, so to test the repair path add a temporary route at an unguessable path
(`/disarm-<random hex>`) that calls `this.ctx.storage.deleteAlarm()`, deploy, hit it, confirm `/status` says "not
armed" and then `next …` after the following quarter-hour cron, and redeploy without the route as soon as it does: anyone
polling an open delete route would keep the alarm gone between cron ticks and stop the feed. The token can be revoked
at any time from the GitHub settings page; the worker then logs HTTP 401 and does nothing.

## Gotchas seen on first deploy (2026-09-09)

- Cloudflare's scheduling API rejects cron triggers until the *account* has a workers.dev subdomain (error 10063).
  Register it once, on the dashboard's Workers page or via `PUT /accounts/{id}/workers/subdomain {"subdomain": "…"}`.
- Cron Triggers on this new account were registered and listed by `/schedules` but did not invoke the worker for
  the first six hours (zero invocations in `workersInvocationsAdaptive`, while an HTTP handler running the same code
  worked). Hence the alarm. The cron came alive at 20:00 UTC the same day, and because `scheduled()` then also
  dispatched, every slot sent two `workflow_dispatch` calls 30 s apart until this fix was deployed: about 100 extra one-minute
  jobs a day, the whole 3,000-minute Actions budget of the then-private repo. `scheduled()` now only re-arms.
- `wrangler secret put` before the first deploy asks to create the worker; answer Y. The secret survives later deploys.

## Cost

Free tier: Workers 100,000 requests a day, Durable Objects included. This uses 24 alarms, 96 cron invocations and
24 dispatches a day.
