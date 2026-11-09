# WaterNow Cloudflare Worker and D1 setup

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

Use isolated local/preview databases for all tests. Never use production credentials or production customer/order data. For a real deployment, create your own Cloudflare resources, configure secrets in the provider secret manager, replace the placeholder D1 ID, review CORS/origin settings and create a separately reviewed deployment workflow.

Never commit `ADMIN_TOKEN`, session secrets, VAPID private keys, Twilio credentials, WhatsApp credentials or any other secret.
