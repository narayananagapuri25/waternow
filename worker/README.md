# Cloudflare Worker and D1 setup

This directory contains the API Worker, D1 schema, migrations, and tests. wrangler.jsonc is a local-development template with a placeholder database ID and localhost origins; do not deploy it as-is.

## Local setup
1. Create worker/.dev.vars (ignored by Git) with local-only dummy values:
   ADMIN_TOKEN, CUSTOMER_SESSION_SECRET, ADMIN_SESSION_SECRET.
2. Install dependencies: npm install.
3. Initialize local D1 from schema.sql:
   npx wrangler d1 execute commerce-development --local --file=./schema.sql --config=./wrangler.jsonc
4. Start locally: npx wrangler dev --local --config=./wrangler.jsonc --port 8787.

Use isolated local/preview databases for all tests. Never use production credentials or production customer/order data. For a real deployment, create your own Cloudflare resources, configure secrets in the provider secret manager, replace the placeholder D1 ID, review CORS/origin settings, and add a separately reviewed deployment workflow.

Never commit ADMIN_TOKEN, session secrets, VAPID private keys, Twilio credentials, WhatsApp credentials, or any other secret. For a new local database bootstrap from schema.sql. For an existing development database apply only migrations not already applied.
