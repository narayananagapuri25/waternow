# WaterNow Cloudflare Worker and D1 setup

WaterNow is split across a Cloudflare Pages customer/Owner application, the `waternow-api` Worker and the dedicated `waternow-production` D1 database. WaterNow resources are isolated from FreshWay and must never reference the FreshWay account, database or secrets.

## Production configuration

- Pages project: `waternow` (`https://waternow.pages.dev`)
- Worker: `waternow-api`
- D1 database: `waternow-production`
- Production Worker config: `wrangler.production.jsonc` (pins the WaterNow account and D1 database)
- Pages API service binding: `WATERNOW_API` → `waternow-api`

Cloudflare Pages deploys the `main` branch through its Git integration. GitHub Actions runs the full CI suite and, after all checks pass on `main`, applies pending D1 migrations, deploys the API Worker and smoke-tests the Worker and Pages API proxy. See [Production deployment](../docs/production-deployment.md) for the one-time GitHub secret setup and the D1 migration-history safety gate.

The deployment workflow requires the GitHub Actions secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The API token must be scoped to the WaterNow account with Workers Editor access for the existing Worker and D1 Editor access for the production database. Never commit credentials.

## Local development

1. Create `worker/.dev.vars` (ignored by Git) with local-only values for `ADMIN_TOKEN`, `CUSTOMER_SESSION_SECRET` and `ADMIN_SESSION_SECRET`.
2. Install dependencies: `npm install`.
3. Initialize a fresh local D1 database from the complete schema snapshot:

   ```bash
   npx wrangler d1 execute waternow-development --local --file=./schema.sql --config=./wrangler.jsonc
   ```

4. Activate the two WaterNow water-pack categories and supplier-managed stock:

   ```bash
   npx wrangler d1 execute waternow-development --local --file=./migrations/0052_waternow_catalogue_seed.sql --config=./wrangler.jsonc
   ```

5. Start locally: `npx wrangler dev --local --config=./wrangler.jsonc --port 8787`.

## D1 migration rules

Apply pending migrations in order. The complete `schema.sql` snapshot already includes the supplier network schema from migration 0051; when bootstrapping a fresh local database from that snapshot, do not apply 0051 again. Apply 0052 to activate the WaterNow catalogue.

For an existing remote D1 database, inspect the Wrangler migration history before applying migrations. The production workflow requires all existing repository migrations through 0052 to be recorded in `d1_migrations`, so old cleanup migrations cannot be replayed against live data. Do not manually create or modify the production migration ledger until the actual database schema and historical migration state have been audited.

Use isolated local/preview databases for tests. Never point local or preview environments at the production database or put customer/order data into test fixtures.
