# SOWESTIM MVP — Honest Self-Assessment
Date: 2026-10-13 (PT). Environment: Linux box, Node v20.19.2, npm 9.2.0. Nothing was pushed or deployed; no money spent.

## 1. Executive summary
A working, locally-runnable MVP. All requested feature areas exist end-to-end (API + UI) with server-side authorization. **21 Vitest tests (unit + API integration) and 4 Playwright e2e tests ran and passed**; build, lint (0 errors, 2 warnings) and typecheck pass. Payments are a clearly labeled mock. Main gaps: no rate limiting / CSP / CSRF tokens, `npm audit` reports high-severity advisories in Next's bundled PostCSS and in ESLint tooling, soft-404 status codes on missing pages, a tiny hard-coded ZIP table for distance search, no schema migrations, no pagination, and several UI paths (image upload via browser, messaging UI, offers UI, BuyBacker/Deal Den/admin UI actions) were verified only through API tests or an HTTP-200 smoke check, not by browser automation.

## 2. Architecture / stack
Next.js 15.5 App Router + React 19 + TypeScript; SQLite via better-sqlite3 11 (raw parameterized SQL, WAL, FK on); bcryptjs; zod. Thin route handlers (`src/app/api/**`) → `route()` wrapper (`src/services/http.ts`) → domain services (`src/services/*.ts`). Server-component pages read via services; writes go through `<ApiForm>` (`src/components/ApiForm.tsx`) to the API. Rationale and diagram: README.md, docs/architecture.md. Deviation from the suggested layout: domain folders `features/*` collapsed into `src/services/<domain>.ts`.

## 3. Feature matrix
Legend: **V** = implemented & verified by automated tests that ran; **I** = implemented, not fully verified; **P** = partial; **M** = mock; **A** = absent.

| Feature | Status | Files | Evidence |
|---|---|---|---|
| Registration / login / logout, bcrypt hashing | V | services/auth.ts, api/auth/* | api.test "auth" (hash format, wrong pw 401, case-insensitive email, logout invalidates); e2e register + login |
| Secure sessions (hashed token, HttpOnly, SameSite, Secure in prod, expiry, ban revokes) | V (expiry path I) | services/auth.ts, services/http.ts | cookie flags asserted; forged token 401; ban → session 401. Expiry deletion not tested |
| Cross-origin mutation block (Origin check) | V | services/http.ts | api.test "blocks cross-origin mutations" |
| User profiles (edit name/city/zip/bio) | V (API) / I (UI) | api/me, app/profile | api.test "updates profile"; page smoke 200 |
| Listing create/edit/delete + inventory | V | services/listings.ts, api/listings/* | api.test CRUD + 403 for non-owner + quantity validation; e2e create listing |
| Image upload validation (magic bytes, 2 MB, random name) | V (API) / I (browser UI) | services/uploads.ts, api/images/[name] | unit sniff test; api.test rejects HTML-as-png, oversize; accepts PNG |
| Browse / search / categories / filters / sort | V | services/listings.ts searchListings, app/page.tsx | api.test search/category/price/sort; e2e search |
| Local discovery (ZIP distance + radius, city filter) | P | services/geo.ts | api.test radius + distance sort. Only 15 hard-coded ZIPs; unknown ZIPs excluded when radius set |
| Seller storefronts | I | app/sellers/[id] | HTTP 200 smoke only |
| Buyer–seller messaging | V (API) / I (UI) | services/messages.ts, app/messages/* | api.test participants-only thread, self-message 400; UI smoke 200. No real-time/push, no read receipts |
| Offers state machine | V | services/commerce.ts | api.test: self-offer 403, wrong-party 403, double transition 409, withdraw then accept 409 |
| Orders state machine + inventory reservation | V | services/commerce.ts | api.test full pay→ship→confirm with role denials, oversell 409, cancel restores stock; e2e full flow in browser |
| Payments | **M** | app/orders, app/listings/[id] | "MOCK CHECKOUT"/"Payments are MOCKED" banners; `pay` only flips status (e2e asserts banner) |
| BuyBacker (submit, admin accept w/ quote / reject, withdraw) | V (API) / I (UI) | services/buyback.ts, app/buyback, app/admin | api.test incl. non-admin 403, bad quote 400, terminal lock 409. No payout (informational) |
| Deal Den (promo codes: site/seller/listing/category scope, expiry, max uses, applied at checkout) | V | services/promotions.ts, app/deals | api.test scope hijack 403, wrong seller 400, max uses, expiry, cancel releases use; e2e SAMTOOLS discount in browser |
| Admin moderation (flag, remove/restore, clear flags, ban/unban) | V | services/admin.ts, api/admin/* | api.test non-admin 403, removed hidden from public/search/ordering, ban revokes sessions + blocks login, banned seller listings 404; e2e non-admin denied |
| PWA manifest, service worker, offline page | P | public/manifest.webmanifest, public/sw.js, app/offline | e2e asserts files served + offline page renders. SW install/offline fallback NOT verified in a browser; icon is SVG only (no PNG 192/512 → install prompt may not appear on some platforms) |
| Loading / error / empty states | I | app/loading.tsx, error.tsx, not-found.tsx, empty-state text in pages | Visual only; not tested |
| Input validation | V | services/validation.ts | unit + integration 400 cases |
| .env.example (no secrets), seed script | V | .env.example, scripts/seed.ts | seed ran successfully; used by e2e |
| CI workflow | I | .github/workflows/ci.yml | written, never executed (not pushed) |
| Email verification, password reset, notifications, reviews/ratings, real payments, shipping | A | — | — |

## 4. Build / lint / typecheck / test results (actual runs, this session)
| Command | Result |
|---|---|
| `npm install` | success (first attempt with better-sqlite3@12 failed: no prebuilt binary & no `make`; pinned to 11.x which has a Node 20 prebuild) |
| `npm run lint` | exit 0 — 0 errors, 2 warnings (`@next/next/no-img-element`); note `next lint` is deprecated in Next 15.5 |
| `npm run typecheck` | exit 0 |
| `npm test` (Vitest 5) | 2 files, **21 passed / 0 failed** |
| `npm run build` | exit 0, all routes dynamic |
| `npx playwright test` (Chromium, Pixel 7 emulation, against `next start`) | **4 passed** (first run: 1 failure caused by an ambiguous test selector; fixed the test, not the app) |
| `npm audit` | 7 vulnerabilities (1 moderate, 6 high); `--omit=dev`: 2 (1 moderate `next`, 1 high `postcss`) |

## 5. Test inventory
- tests/unit/core.test.ts (4 tests): validation, geo distance, image sniffing, state-machine terminal states.
- tests/integration/api.test.ts (17 tests): calls real route handlers with real `Request` objects against fresh in-memory SQLite.
- tests/e2e/critical.spec.ts (4 tests): register+create+search; buy with promo → mock pay → ship → confirm across two accounts; non-admin denial (page + API); PWA assets.

## 6. Security findings (by severity)
**High**
- H1 `npm audit`: `postcss <=8.5.22` (bundled by `next`) — XSS in stringify / sourcemap file read. Only reachable at build-time CSS processing of our own CSS; fix requires Next 16 (breaking). Dev-only: `braces`/`fast-glob` via `eslint-config-next` (DoS).
- H2 No rate limiting on login/register/messaging/flags → credential stuffing & spam possible.
**Medium**
- M1 CSRF defense is SameSite=Lax + Origin check; requests *without* an Origin header are allowed (older clients). No CSRF token.
- M2 No Content-Security-Policy header.
- M3 `next` moderate advisory (npm audit, prod).
- M4 Uploaded images are stored and served as-is (no re-encoding/EXIF stripping → location metadata leak from phone photos).
- M5 Sessions are not rotated on privilege change; no "log out all devices"; no account lockout.
**Low**
- L1 Login timing equalization uses a dummy hash; registration still reveals "Email already registered" (enumeration).
- L2 No audit log for admin actions.
- L3 Admin role can only be granted via direct DB update (seed does this) — acceptable but undocumented in UI.
- L4 Deleted listing images are removed, but soft-removed listings keep their image files.
Positive controls: parameterized SQL, server-side ownership/role checks in services (denials tested), hashed session tokens, strict image name regex on the image route (no path traversal), safe `next` redirect on login, nosniff/frame-deny headers.

## 7. Known defects (with repro)
1. **Soft 404**: `GET /listings/999` returns HTTP 200 with the not-found UI (root `loading.tsx` starts streaming before `notFound()`). Repro: `curl -o /dev/null -w '%{http_code}' localhost:3000/listings/999` → 200. API returns proper 404.
2. **Accepted offers don't reserve inventory**: seller accepts two offers for the last unit; the second buyer's checkout fails with 409 "Not enough inventory". Repro: qty-1 listing, two buyers offer, seller accepts both, both check out.
3. **Removed/banned listing orders still progress**: orders created before a listing is removed can still be paid/shipped. Repro: order → admin removes listing → buyer pays (succeeds).
4. **ZIP coverage**: distance search only works for 15 ZIPs in `src/services/geo.ts`; listings with other ZIPs are excluded from radius results.
5. **No pagination**: search hard-limited to 200 rows.
6. **Offline UX**: authenticated pages cached by the SW network-first strategy may show another session's stale HTML on a shared device after logout (cache not cleared on logout).
7. Messages have no unread state or notifications; refresh needed to see replies.
8. Promo `uses` counts orders; a buyer can reuse a site-wide code unlimited times unless `max_uses` is set (no per-user limit).

## 8. UX / accessibility / mobile notes
Mobile-first CSS, 44px touch targets, 16px inputs (avoids iOS zoom), skip link, visible focus ring, labeled inputs (e2e uses `getByLabel`, confirming label association), `role=alert` on errors, `aria-live` on chat. Not done: automated axe audit, color contrast check of `.muted` text, responsive nav collapses into a wrapping row (gets crowded when logged in as admin), tables on small screens overflow, no image preview on upload, prices entered in dollars without currency formatting help, timestamps shown in raw UTC.

## 9. DB / integration assessment
SQLite single file with WAL; good for a single-instance MVP, not for horizontal scaling. Schema created idempotently at startup — **no migration system**; any schema change requires manual SQL. Money stored as integer cents. Inventory decrement is atomic (conditional UPDATE in a transaction) — tested sequentially; true concurrent multi-process load not tested. Image storage is local disk (not suitable for serverless/multi-instance). No external integrations (payments, email, maps, geocoding) — all absent or mocked.

## 10. Remediation roadmap
1. (Now) Rate limiting (login/register/messages), CSP header, clear SW page cache on logout, fix soft-404 by removing root `loading.tsx` or moving it to route segments.
2. (Next) Migrations (Drizzle/Kysely or Prisma Migrate), pagination, reserve inventory on offer acceptance (or expire accepted offers), block transitions on removed listings, per-user promo limits, image re-encode + EXIF strip (sharp).
3. (Later) Upgrade to Next 16 to clear PostCSS advisory; migrate `next lint` to ESLint CLI flat config; PNG icons + install prompt; real geocoding; Postgres + object storage; Stripe test mode behind a feature flag; email verification/password reset; notifications; axe accessibility tests in CI.

## 11. Remaining limitations
Mock payments only; no shipping, taxes, refunds beyond status change; no reviews/ratings; no email; admin creation via DB/seed only; English only; CI file never run.

## 12. Recommended next milestone
"Pilot-ready": items in roadmap step 1 + migrations + pagination + inventory-reservation fix + axe/a11y and SW offline tests in Playwright, then a staging deploy with Postgres and object storage.
