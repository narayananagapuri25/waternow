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
4. Wrangler applies only migrations that are still pending. Migration `0053_delivery_store_supplier_partner_guards.sql` adds nullable-reference integrity triggers for legacy network tables; it does not require a supplier for a normal WaterNow order. Migration `0054_waternow_owner_managed_pack_prices.sql` sets the 20L can to ₹30 and the two-can 10L pack to ₹20 in the central catalogue.
5. Wrangler deploys the Worker using the dedicated WaterNow production configuration.
6. A smoke test checks the Worker `/api/admin/status` endpoint and `https://waternow.pages.dev/api/products`, which verifies that Pages can reach the Worker through the `WATERNOW_API` service binding.

The workflow never replays historical cleanup migrations to establish a baseline. It does not delete the production database or infer that a schema-only match is sufficient: the historical data checks, foreign keys and recovery bookmark must also pass. An unexpected schema, data fingerprint, migration ledger, or foreign-key state must fail closed for manual audit.

## Important D1 data-safety rules

The repository contains older cleanup migrations, including migrations that intentionally remove selected legacy records. A production D1 database that was created or populated outside Wrangler may not have a complete Wrangler migration ledger.

Never delete the production D1 database, execute the full historical migration chain, manually fabricate migration history, or bypass the preflight. If the bootstrap or baseline verifier fails, inspect the live schema and existing data history first. Only establish a baseline after confirming that the live database is exactly the expected WaterNow state and that a recovery point exists.

For future schema changes, add a new numbered SQL migration under `worker/migrations`. Never edit a migration that has already been applied. The production workflow will pick up a new migration only after the full CI suite and baseline safety gates pass.

## Before enabling real customer orders

Configure these in the Owner app using verified business information:

- The WaterNow dispatch location in **Brindavan Colony, Boduppal**, with the actual shop entrance selected on the map and the intended delivery radius confirmed.
- Actual on-hand inventory for each pack at that store. The order flow checks store stock; a sample basket of five 20L cans and five 2 × 10L packs requires at least five sellable units of each.
- The central pack prices are set by migration 0054 to ₹30 for one 20L can and ₹20 for one pack containing two 10L cans. WaterNow can manage store-specific overrides in the Owner app; do not silently substitute another price.
- The legal operator, customer support contact and verified business address.
- Original WaterNow product photographs or images WaterNow is authorised to use.

No supplier onboarding, supplier approval, supplier price feed or delivery-partner registration is required in the normal WaterNow customer-to-Owner order flow. The store must still be active, inside the customer's service radius, and have the requested products enabled with enough stock. A CI pass or deployment health check alone is not proof that the live ordering journey is ready.
