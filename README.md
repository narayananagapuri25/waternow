# WaterNow

WaterNow is a drinking-water ordering and supplier-operations Progressive Web App (PWA). The customer catalogue presents the two WaterNow packs together:

- 20L water can
- Pack of two 10L cans

Product names, supplier prices and stock are managed through the catalogue and supplier workflows. The application must not invent or assume a price: a pack stays non-orderable until an approved supplier has configured a valid price and available stock.

## Application architecture

WaterNow uses separate Cloudflare resources so its data and operations remain isolated from FreshWay:

| Component | Resource |
| --- | --- |
| Customer and Owner PWA | Cloudflare Pages project `waternow` |
| Customer app | `https://waternow.pages.dev/` |
| Owner app | `https://waternow.pages.dev/admin.html` |
| API | Cloudflare Worker `waternow-api` |
| Operational database | Cloudflare D1 database `waternow-production` |
| Pages-to-Worker API | `WATERNOW_API` service binding |

The production Worker configuration is `worker/wrangler.production.jsonc`. Keep the production account and database binding pinned to the WaterNow resources. Never reuse FreshWay credentials, databases, or bindings.

## What is included

- Customer catalogue, address and delivery eligibility, cart, checkout, order history and customer messaging.
- Owner sign-in and operations for orders, delivery planning, customers, catalogue, store locations, reports, settings and notifications.
- Interactive store map-pin selection with address search, draggable marker, current-location support and a delivery-radius preview.
- Supplier and delivery-partner onboarding, supplier-specific pack pricing and stock, compliance review and supplier-to-dispatch-location linking.
- Supplier fulfilment records and support for supplier-delivered or WaterNow-arranged last-mile fulfilment.
- Privacy information and customer account-deletion flow.
- Automated Worker/D1, Owner regression, customer browser and Playwright delivery-fallback tests.

Suppliers must remain inactive until the applicable FSSAI licence or registration and packaged-water testing evidence have been reviewed. Submitting supplier details is not proof of compliance. Do not enable a dispatch location until its service area, supplier link, prices and stock have been checked.

## Development setup

Use a supported Node.js LTS release (CI currently uses Node.js 22).

1. Install Worker dependencies:

   ```bash
   cd worker
   npm install
   ```

2. Create `worker/.dev.vars` with local-only values for the Worker secrets. This file is ignored by Git; never commit secrets.
3. Initialise a fresh local D1 database from the canonical schema and WaterNow catalogue seed:

   ```bash
   npx wrangler d1 execute waternow-development --local --file=./schema.sql --config=./wrangler.jsonc
   npx wrangler d1 execute waternow-development --local --file=./migrations/0052_waternow_catalogue_seed.sql --config=./wrangler.jsonc
   ```

   The full schema snapshot already includes the supplier-network schema from migration 0051, so do not apply 0051 again after loading that snapshot.
4. Start the local Worker:

   ```bash
   npx wrangler dev --local --config=./wrangler.jsonc --port 8787
   ```

Use isolated local or preview databases for tests. Never point a local or preview environment at the production database or populate test fixtures with real customer or order data.

## Test commands

Run the Worker/D1 suite:

```bash
cd worker
npm test
```

Run the Owner regression contracts from the repository root:

```bash
node --test admin-navigation.test.js admin-orders.test.js admin-performance.test.js
```

Run customer catalogue and service-worker regressions:

```bash
node sw-notification-refresh.test.js
node frontend/customer/catalogue.test.js
```

Run the browser journeys (after installing the Playwright dependencies and Chromium):

```bash
cd e2e
npm ci
npx playwright install --with-deps chromium
npx playwright test --config=playwright.config.js
npx playwright test --config=playwright.store-fallback.config.js
```

The GitHub Actions workflow runs these checks on pull requests and pushes to `main`. It also builds the production Worker bundle in dry-run mode without deploying it during the test job.

## Production deployment and safety gates

Cloudflare Pages keeps its existing Git integration and deploys `main`. After all CI test jobs pass on a push to `main`, GitHub Actions verifies the production D1 migration baseline, applies only pending migrations, deploys `waternow-api`, and smoke-tests both the Worker health endpoint and the Pages API proxy.

Configure the two GitHub Actions repository secrets described in [the production deployment guide](docs/production-deployment.md):

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The token must be scoped to the WaterNow account and to the required Workers Editor and D1 Editor permissions. Never commit a token or use a Global API Key.

**Production data safety is mandatory.** The existing D1 database may have been created or populated outside Wrangler. The deployment workflow therefore verifies the recorded migration history and, where necessary, performs a guarded baseline preflight against the live schema, historical data fingerprints, foreign keys and a recovery bookmark. It must fail closed if those checks do not match. Never delete the production database, replay the full migration history, or manually fabricate the migration ledger to bypass this guard. See [docs/production-deployment.md](docs/production-deployment.md).

## Before accepting real orders

Complete these operational steps in the Owner app using verified business information:

1. Configure accurate store location pins and delivery radii.
2. Add and review a real supplier, including the applicable compliance and water-testing documents.
3. Link the approved supplier to the intended dispatch location.
4. Enter the supplier-agreed prices and real stock quantities for the two packs.
5. Confirm customer-support contacts, legal operator details, delivery coverage and supplier-authorised product photographs.
6. Place and fulfil a controlled end-to-end test order before enabling public ordering.

Do not guess prices, business details, store coordinates, service coverage or compliance status. A successful code build or deployment is not, by itself, proof that the business is ready to accept orders.
