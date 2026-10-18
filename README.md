# SOWESTIM — South West Item Mart (SWIM) MVP

Mobile-first marketplace PWA: listings, search & local discovery, storefronts, messaging, offers/orders (mock payments), **BuyBacker** buyback quotes, **Deal Den** promo codes, and admin moderation.

> **Payments are simulated.** "Pay (mock)" only changes order status. No payment provider is integrated.

## Quick start
Requires Node 20+ (`better-sqlite3` v11) or Node 22/24 (`better-sqlite3` v12 — prebuilt binaries; no compiler needed on common platforms).
```bash
npm install
cp .env.example .env        # optional; defaults work without it
npm run seed                # creates ./data/swim.db with demo data (wipes existing data)
npm run dev                 # http://localhost:3000
```
Demo logins (password `password123`): `admin@swim.test`, `seller@swim.test`, `buyer@swim.test`, `nm@swim.test`. Try promo codes `WELCOME10` (site-wide) and `SAMTOOLS` (Sam's tools).

Production-mode locally: `npm run build && INSECURE_COOKIES=1 npm start` (`INSECURE_COOKIES=1` is needed only because localhost is plain http; the service worker registers only in production builds).

## Scripts
| command | what |
|---|---|
| `npm run lint` | ESLint (next/core-web-vitals) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + API integration tests (in-memory SQLite) |
| `npm run test:e2e` | Playwright (builds must exist: run `npm run build` first; run `npx playwright install chromium` once) |
| `npm run seed` | demo data |

## Stack and why
- **Next.js 15 (App Router) + TypeScript**: one deployable for UI + API route handlers, server components render data with no client fetching layer, and mobile-first HTML works without a SPA framework on top.
- **SQLite via `better-sqlite3`, versioned migrations** (`src/services/migrations.ts`, tracked in `schema_migrations`): zero external services, synchronous transactions make inventory/state-machine updates simple and atomic. Trade-off: single-node only.
- **bcryptjs** (pure JS hashing), **zod** (input validation). That is the entire runtime dependency list besides React.
- Opaque random session tokens, stored **SHA-256 hashed** in the DB, sent as `HttpOnly; SameSite=Lax` (+`Secure` in production) cookie.
- **Rate limiting** on login/register/messaging/flagging (fixed window per IP, 429 + Retry-After); **Content-Security-Policy** header on all routes.

## Layout
```
src/app/            pages (server components) + app/api/** route handlers (thin)
src/components/     ApiForm (client fetch form), ListingCard, ListingFields, SW registration
src/services/       domain logic: auth, listings, commerce (offers/orders), buyback, promotions, messages, admin, uploads, geo, http, validation, db
scripts/seed.ts     demo data
tests/unit|integration|e2e
docs/               product overview, architecture, feature status, security, roadmap
public/             manifest.webmanifest, sw.js, icon.svg
```
The suggested `features/{...}` split was folded into `src/services/<domain>.ts` files to keep the MVP small; see docs/architecture.md.

See **ASSESSMENT.md** for the honest status report.
