# WaterNow production deployment

WaterNow uses separate deployments for the customer Pages site and the API Worker:

- Cloudflare Pages keeps its Git integration and deploys the `main` branch to `https://waternow.pages.dev`.
- GitHub Actions runs the full WaterNow CI suite. Only after all test jobs pass on `main`, it applies pending D1 migrations and deploys `waternow-api`.
- The deployment job smoke-tests the Worker health endpoint and the Pages `/api/products` proxy. The latter verifies that Pages can reach the Worker through the `WATERNOW_API` service binding.

## One-time GitHub secrets

In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The WaterNow account ID already pinned in `worker/wrangler.production.jsonc`: `17f1561ed0052cf9d484cb4becbf8810` |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token scoped only to the WaterNow account |

Create the Cloudflare token from **My Profile / Account API Tokens**. Grant the minimum permissions needed by this workflow: **Workers Editor** for the existing `waternow-api` Worker and **D1 Editor** for `waternow-production`. Scope the token to the WaterNow account and, where the dashboard permits, to those individual resources. Do not use a Global API Key and do not commit the token.

## Deployment sequence

For each merge or direct push to `main`:

1. Worker/D1 unit tests, Owner regression tests, customer browser journeys and the isolated delivery fallback tests must all pass.
2. The production job checks that the live `d1_migrations` ledger records every existing repository migration through `0052_waternow_catalogue_seed.sql`.
3. Wrangler applies only migrations that are still pending.
4. Wrangler deploys the Worker using the dedicated production config.
5. A smoke test checks `/api/admin/status` on the Worker and checks that `https://waternow.pages.dev/api/products` returns both WaterNow water packs through the Pages service binding.

Cloudflare Pages continues to deploy the website from its existing Git integration. No Pages API token or Direct Upload conversion is required.

## Important D1 safety gate

The repository contains historical cleanup migrations, including migrations that intentionally delete selected legacy records. A database created from the complete `worker/schema.sql` snapshot or populated outside Wrangler may not have a matching Wrangler migration ledger.

For that reason, the workflow **fails closed** unless every existing migration through 0052 is already recorded in `d1_migrations`. It does not create or fabricate migration history, and it does not replay the old migrations to try to repair a missing ledger. If the guard fails, stop and audit the live schema and migration history before establishing the baseline. Do not delete the D1 database, execute the full migration history, or edit the migration ledger manually without that audit.

For future schema changes, add a new numbered SQL migration under `worker/migrations`. Never edit an already-applied migration. The production workflow will pick up the new migration after the baseline guard and the complete CI suite pass.
