# Configurable commerce PWA starter

WaterNow is a local drinking-water ordering PWA and supplier operations starter, adapted from the imported commerce PWA foundation. It supports 20L cans and packs of two 10L cans, supplier onboarding, owner operations and Cloudflare D1.

## Safety and reuse
- This is a development/template copy, not a live WaterNow deployment.
- Production deployment workflows and production/live-data audit suites were intentionally omitted.
- No production credentials are included. `worker/wrangler.production.jsonc` contains a D1 UUID that has not been verified against the WaterNow Cloudflare account; confirm or replace it before deployment.
- Configure your own Cloudflare account, D1 database, domain, secrets, and notification providers before deployment.
- Never point local, preview, or test environments at a production database.

## Quick start
1. Use a supported Node.js LTS release.
2. Review ARCHITECTURE.md, CONTRIBUTING.md, SECURITY.md, and worker/README.md.
3. Create an isolated local/preview D1 database.
4. Create local-only secrets in worker/.dev.vars (ignored by Git; never commit it).
5. Install Worker dependencies: cd worker && npm install.
6. Initialize local D1 from worker/schema.sql, then apply worker/migrations/0052_waternow_catalogue_seed.sql for the two WaterNow water packs.
7. Run the Worker locally.
8. Run unit and isolated Playwright tests before configuring deployment.

## Source snapshot
Imported from nagapurinarayana-ship-it/freshway, branch main, during 2026-11-07. This is a snapshot, not a fork; future changes do not synchronize automatically.


## WaterNow product direction
- Customer home presents both water packs together: 20L cans and 2 × 10L cans. Selecting a pack filters the catalogue in place; it does not open a separate category page.
- Prices remain unavailable until the owner has agreed and entered supplier pricing. A zero-priced item is intentionally not orderable.
- The owner can onboard suppliers and delivery partners by city. Newly added suppliers remain inactive until an administrator verifies the applicable FSSAI licence/registration and packaged-water testing records.
- Supplier delivery and WaterNow-arranged last-mile delivery are represented separately in the network model.
- Use a Cloudflare D1 database for customer, catalogue, supplier, partner, order and fulfilment records. Do not store operational business data in inline JavaScript.

## Catalogue image sources
The initial water-can reference images are external catalogue examples; replace them with approved supplier-owned product photographs before production:
- 20L reference: https://www.aquacoolthrissur.com/images/products/packaged-mineral-water-20l-can-thrissur.png
- 10L reference: https://www.bbassets.com/media/uploads/p/l/40366456_1-bailley-bailley-packaged-drinking-water.jpg
