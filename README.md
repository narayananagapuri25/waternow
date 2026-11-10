# WaterNow

WaterNow is a customer ordering PWA and a simple Owner app for selling drinking water directly. It supports exactly one 20L water can and one 10L water can. WaterNow manages its own catalogue, selling prices, store stock, delivery locations, orders, customer contacts, payments and delivery schedules. There is no supplier onboarding or supplier approval step in the normal order flow.

## Safety and deployment
- Treat this repository as a development snapshot until its Cloudflare configuration, operational details and live smoke tests have been verified.
- Keep production credentials in GitHub Actions secrets and Cloudflare; never commit or paste them into chat.
- Never point local, preview, or test environments at a production database.
- Use an isolated D1 database for development and Playwright testing.

## Quick start
1. Use a supported Node.js LTS release.
2. Review ARCHITECTURE.md, CONTRIBUTING.md, SECURITY.md, and worker/README.md.
3. Create an isolated local/preview D1 database.
4. Create local-only secrets in worker/.dev.vars (ignored by Git; never commit it).
5. Install Worker dependencies: `cd worker && npm install`.
6. Initialize local D1 from worker/schema.sql, then apply the WaterNow seed and numbered pending migrations in order.
7. Run the Worker locally.
8. Run Worker tests and the customer/Owner Playwright suites before configuring deployment.

## Source snapshot
Imported from nagapurinarayana-ship-it/freshway, branch main, during 2026-11-07. This is a snapshot, not a fork; future changes do not synchronize automatically.

## WaterNow product and order flow
- The customer home presents exactly two WaterNow products: 20L Drinking Water Can and 10L Drinking Water Can.
- The existing WaterNow central catalogue prices are ₹30 for the 20L can and ₹20 for the 10L can. These saved prices are retained; catalogue migrations normalize product names and units without changing them.
- The Owner app manages product visibility, store-specific price overrides, on-hand inventory, delivery radius, customer orders, delivery dates, payment status and cancellations.
- No supplier account, supplier pricing approval, delivery partner record or supplier link is required to accept a normal WaterNow order.
- A product is orderable only when it is active, available at the selected store, has a positive selling price, and has sufficient available stock at that store.
- Use Cloudflare D1 for customer, catalogue, store, inventory, order and fulfilment records. Do not store operational business data in inline JavaScript.

## Catalogue images
Use original WaterNow product photographs or images that WaterNow is authorised to use. The initial reference images are examples only; review and replace them before production:
- 20L reference: https://www.aquacoolthrissur.com/images/products/packaged-mineral-water-20l-can-thrissur.png
- 10L reference: https://www.bbassets.com/media/uploads/p/l/40366456_1-bailley-bailley-packaged-drinking-water.jpg
