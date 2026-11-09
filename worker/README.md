# WaterNow Cloudflare Worker and D1 setup

**Account isolation:** WaterNow must use a new, separate Cloudflare account, Worker, Pages project, domain and D1 database. The FreshWay Cloudflare account and its D1 database are not connected to this repository and must never be selected for WaterNow. No Cloudflare account credentials or deployed resources have been verified. `wrangler.production.jsonc` contains a D1 UUID that must be confirmed against the WaterNow account or replaced with the UUID returned by that account before deployment.

This directory contains the customer and owner API Worker, D1 schema, additive migrations and tests. `wrangler.jsonc` is a local-development template with a placeholder database ID and localhost origins; do not deploy it as-is.

## Local setup

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

## Existing D1 databases

Apply pending migrations in order using the Cloudflare D1 migration workflow. WaterNow adds `0051_waternow_supplier_network.sql` and `0052_waternow_catalogue_seed.sql`. Do not manually apply the additive `0051` migration on a database that was bootstrapped from the complete `schema.sql` snapshot, because that snapshot already includes the supplier tables and delivery-store columns; in that case apply only `0052` to activate the WaterNow catalogue.

Use isolated local/preview databases for all tests. Never use production credentials or production customer/order data. For a real deployment, sign in to the new WaterNow Cloudflare account, create a new D1 database named waternow-production, and use only the database UUID returned by that account. Create a new WaterNow Worker and Pages project in that same account; configure secrets there; verify or replace the D1 UUID in `wrangler.production.jsonc` with the UUID returned by the WaterNow Cloudflare account; set the WaterNow domain/origin; and create a separately reviewed deployment workflow. Do not copy any FreshWay account ID, D1 UUID, API token, domain binding or secret.

Never commit `ADMIN_TOKEN`, session secrets, VAPID private keys, Twilio credentials, WhatsApp credentials or any other secret.
