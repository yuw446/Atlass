# tick-dispatch

A Cloudflare Worker with one job: every 15 minutes, ask GitHub to run `tick.yml`. GitHub's own `schedule` trigger
dropped 42 of the first 44 runs on this private repo; Cloudflare crons are punctual and free at this volume.
The workflow keeps its own `schedule:` as a fallback, so if this worker ever stops the feed still limps along.

## Deploy (once, about ten minutes)

1. Create a fine-grained personal access token at https://github.com/settings/personal-access-tokens/new:
   repository access **only `yuw446/Atlass`**, permission **Actions: Read and write**, nothing else. Copy it.
2. From this directory:
   ```bash
   npx wrangler login                     # opens the browser; free Cloudflare account is enough
   npx wrangler secret put GITHUB_TOKEN   # paste the token; it is stored encrypted, never in git
   npx wrangler deploy
   ```
3. Check it fires: `npx wrangler tail` for a couple of minutes past a quarter hour, or look for
   `workflow_dispatch` runs at https://github.com/yuw446/Atlass/actions/workflows/tick.yml.

The token can be revoked at any time from the same GitHub settings page; the worker then logs HTTP 401 and does nothing.

## Cost

Free tier: 100,000 requests a day; this uses 96. No Cloudflare paid plan needed.
