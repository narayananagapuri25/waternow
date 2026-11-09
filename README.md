# Configurable commerce PWA starter

This private repository contains a full application source snapshot imported from FreshWay: customer PWA, owner/admin interface, Cloudflare Pages Functions and Worker API, D1 schema and migrations, assets, and automated tests.

## Safety and reuse
- This is a development/template copy, not a live FreshWay deployment.
- Production deployment workflows and production/live-data audit suites were intentionally omitted.
- No production credentials or production D1 database identifier are included.
- Configure your own Cloudflare account, D1 database, domain, secrets, and notification providers before deployment.
- Never point local, preview, or test environments at a production database.

## Quick start
1. Use a supported Node.js LTS release.
2. Review ARCHITECTURE.md, CONTRIBUTING.md, SECURITY.md, and worker/README.md.
3. Create an isolated local/preview D1 database.
4. Create local-only secrets in worker/.dev.vars (ignored by Git; never commit it).
5. Install Worker dependencies: cd worker && npm install.
6. Initialize local D1 from worker/schema.sql and run the Worker locally.
7. Run unit and isolated Playwright tests before configuring deployment.

## Source snapshot
Imported from nagapurinarayana-ship-it/freshway, branch main, during 2026-11-07. This is a snapshot, not a fork; future changes do not synchronize automatically.
