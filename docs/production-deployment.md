# WaterNow production deployment

WaterNow uses separate deployments for the customer Pages site and the API Worker:

- Cloudflare Pages keeps its existing Git integration and deploys the `main` branch to `https://waternow.pages.dev`.
- GitHub Actions runs the complete WaterNow CI suite on pull requests and pushes to `main`.
- Only after Worker/D1, Owner UI and customer browser/Playwright jobs pass on `main`, the production job verifies the D1 migration baseline, applies pending migrations, deploys `waternow-api`, and smoke-tests both the Worker and the Pages-to-Worker service binding.

## One-time GitHub Actions secrets

In the repository, open **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | The WaterNow account ID pinned in `worker/wrangler.production.jsonc` |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token scoped only to the WaterNow account |

Create the token from **My Profile / Account API Tokens**. Grant the minimum permissions required by this workflow: **Workers Editor** for the `waternow-api` Worker and **D1 Editor** for `waternow-production`. Scope the token to the WaterNow account and, where Cloudflare permits, to the individual resources. Do not use a Global API Key and do not commit the token. The account ID is configuration metadata; the API token is secret and must never be pasted into chat, source code, logs, or a PR.

Cloudflare Pages continues to use its existing Git integration. No Pages API token or Direct Upload conversion is required.

## Production deployment sequence

For a merge or direct push to `main`:

1. Worker/D1 unit tests, Owner navigation/orders/performance regressions, customer browser journeys and isolated delivery/store-fallback Playwright tests must all pass.
2. The deployment job runs the guarded production D1 baseline bootstrap. If the live database already has a non-empty migration ledger, the bootstrap leaves it unchanged and the next step verifies it. If the ledger is absent or empty, the bootstrap first exports and compares the production schema against the canonical WaterNow schema, verifies historical data fingerprints and foreign-key integrity, and captures a D1 Time Travel recovery bookmark. It records baseline migration names only if every preflight matches.
3. The strict baseline verifier confirms that every historical repository migration through `0052_waternow_catalogue_seed.sql` is already accounted for. If any check fails, the job stops before applying migration SQL or deploying the Worker.
4. Wrangler applies only migrations that are still pending. At the current repository revision, `0053_delivery_store_supplier_partner_guards.sql` is the next pending migration; it adds referential-integrity triggers for supplier and delivery-partner references without rebuilding populated tables.
5. Wrangler deploys the Worker using the dedicated WaterNow production configuration.
6. A smoke test checks the Worker `/api/admin/status` endpoint and `https://waternow.pages.dev/api/products`, which verifies that Pages can reach the Worker through the `WATERNOW_API` service binding.

The workflow never replays historical cleanup migrations to establish a baseline. It does not delete the production database or infer that a schema-only match is sufficient: the historical data checks, foreign keys and recovery bookmark must also pass. An unexpected schema, data fingerprint, migration ledger, or foreign-key state must fail closed for manual audit.

## Important D1 data-safety rules

The repository contains older cleanup migrations, including migrations that intentionally remove selected legacy records. A production D1 database that was created or populated outside Wrangler may not have a complete Wrangler migration ledger.

Never delete the production D1 database, execute the full historical migration chain, manually fabricate migration history, or bypass the preflight. If the bootstrap or baseline verifier fails, inspect the live schema and existing data history first. Only establish a baseline after confirming that the live database is exactly the expected WaterNow state and that a recovery point exists.

For future schema changes, add a new numbered SQL migration under `worker/migrations`. Never edit a migration that has already been applied. The production workflow will pick up a new migration only after the full CI suite and baseline safety gates pass.

## Before enabling real customer orders

The application code being deployed does not provide the operational facts needed to accept orders. Configure these in the Owner app using verified business information:

- Exact store pin and delivery radius, including the Boduppal service point if that is the chosen dispatch location.
- An approved WaterNow supplier linked to the dispatch location, with applicable FSSAI and packaged-water testing documentation reviewed.
- Supplier-approved price and actual stock for the 20L can and the pack of two 10L cans.
- The legal operator, support contact and verified business address.
- Product images the supplier is authorised to use.

The current WaterNow seed is deliberately unpriced and has zero stock for both packs. Do not guess or copy prices from another business. Until approved prices, stock, service coverage and the supplier link are configured, checkout must keep these packs unavailable for ordering. A successful CI run, Worker deployment or health check is not proof that the business is ready to accept live orders.
