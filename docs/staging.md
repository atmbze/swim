# SWIM Staging Deploy Runbook

Status: **code refactor COMPLETE (2026-11-21, branch `neon-port`) — accounts/deploy not yet done.**
No Vercel/Neon/Cloudflare accounts exist yet; Steps 1–8 below are the deploy-day sequence.
Background and rationale: `STAGING_PLAN_2026-11-21.md` in the goal workspace
(`~/workspace/goals/s-w-i-m-marketplace-website-build/files/`); what the refactor changed,
the test-database choice, and deviations are in `STAGING_PORT_2026-11-21.md` next to it.
Route: Vercel (app) + Neon Postgres (DB) + Cloudflare R2 (photos), all free tiers for staging.
The app now runs on Postgres via `pg` (SQLite/better-sqlite3 removed) and stores photos in
R2 when the `R2_*` env vars are set (local disk otherwise), so Steps 4–8 work as written once
`neon-port` is merged to `master` and pushed.

## Sign-ins the user (Rare) must do personally

Deployment cannot start until these exist — account creation is the user's, with his
own email/payment identity where asked:

1. **GitHub** — confirm `eaf35ff` (and later the refactor branch) is pushed to
   `github.com/atmbze/swim` (local master was ahead of origin at prep time).
2. **Vercel** — sign up / sign in (with the GitHub account above), Hobby plan for staging.
3. **Neon** — sign up / sign in, Free plan, create the staging project (below).
4. **Cloudflare** — sign up / sign in, enable R2 for the account, create the bucket +
   API token (below). (R2 may ask for a payment method to enable, even on the free tier.)
5. Later, at commercial launch only: Vercel Pro upgrade (user's card) — **not** staging.

No Stripe sign-in or keys are needed for staging (payments stay mocked).

## Step 0 — Preconditions

- [x] Refactor done on branch `neon-port` (2026-11-21): typecheck + lint clean,
      31/31 tests green against real Postgres, production build OK, full local
      seed + curl verification loop passed (see `STAGING_PORT_2026-11-21.md`).
- [ ] `neon-port` merged to `master` (Rare's call).
- [ ] `eaf35ff` + refactor pushed to `origin/master` on GitHub (needs Rare's GitHub sign-in —
      the local `origin/master` ref still shows `14b539f`, one commit behind local master).

## Step 1 — Neon project (user signed in)

1. Create project, name: `swim-staging`, region: closest US region to the audience
   (e.g. US West / us-west-2), Postgres version: latest offered.
2. From the project's Connection Details, copy **both** strings:
   - Pooled (host contains `-pooler`) → becomes `DATABASE_URL`
   - Direct / unpooled → becomes `DATABASE_URL_UNPOOLED`
3. Keep them out of chat/git — they go straight into Vercel env (Step 4) and the local
   `.env` used for migrate/seed (Step 5–6).

## Step 2 — Cloudflare R2 bucket + token (user signed in)

1. R2 → Create bucket, name: `swim-staging-images`, location: automatic.
2. Make it publicly readable for image serving: either enable the bucket's `r2.dev`
   public URL (development/staging-grade) or bind a custom domain
   (e.g. `images-staging.sowestim.com`). Record the base as `R2_PUBLIC_BASE_URL`.
3. R2 → Manage API Tokens → Create token scoped to **this bucket**, Object Read & Write.
   Record `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` and the `R2_ACCOUNT_ID`
   (S3 endpoint: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`).

## Step 3 — Vercel project (user signed in)

1. Add New → Project → Import `atmbze/swim` from GitHub.
2. Framework preset: Next.js (auto-detected). Root directory: `./`. Build command:
   `npm run build` (default). Do **not** deploy yet — set env first (Step 4), and pause
   the initial deployment if Vercel starts one.
3. Settings → Domains (later, optional for staging): add a staging subdomain such as
   `staging.sowestim.com` and create the DNS record Vercel shows at Northwest
   (separate task — do not touch the live `www` Layout records).

## Step 4 — Environment variables in Vercel (Project → Settings → Environment Variables, scope: Preview + Production of the staging project)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled string from Step 1 |
| `DATABASE_URL_UNPOOLED` | Neon direct string from Step 1 |
| `R2_ACCOUNT_ID` | from Step 2 |
| `R2_ACCESS_KEY_ID` | from Step 2 |
| `R2_SECRET_ACCESS_KEY` | from Step 2 (mark as sensitive/secret if offered) |
| `R2_BUCKET` | `swim-staging-images` |
| `R2_PUBLIC_BASE_URL` | public base from Step 2 |
| `PLATFORM_FEE_BPS` | `990` |
| `PLATFORM_FEE_LOCAL_BPS` | `0` |
| `BCRYPT_COST` | `10` |
| `SEED_PASSWORD` | a fresh staging-only password (not `password123`, not any real one) |
| `INSECURE_COOKIES` | **leave unset** (staging is HTTPS) |
| `DATABASE_PATH`, `UPLOAD_DIR`, `ALLOW_STAGING_SEED` | **do not set in Vercel** |

## Step 5 — Run migrations against staging Neon (from a trusted local machine)

```bash
cp .env.example .env   # fill DATABASE_URL_UNPOOLED with the real staging value, local only
npm run migrate        # (script added by the refactor; runs the PG migration set once)
```

Verify in the Neon console SQL editor: tables exist and
`SELECT * FROM schema_migrations;` shows all versions applied.

## Step 6 — Seed staging (once, guarded)

```bash
DATABASE_URL_UNPOOLED=<staging direct string> SEED_PASSWORD=<same as Step 4> ALLOW_STAGING_SEED=1 npm run seed
```

Expect: 4 demo accounts (`admin@swim.test`, `seller@swim.test`, `buyer@swim.test`,
`nm@swim.test`), 6 listings, promo codes `WELCOME10` / `SAMTOOLS`, 1 buyback request.
⚠️ The seed **wipes all tables** — never re-run it against a database you care about,
and never against production.

## Step 7 — Deploy

1. Vercel → Deployments → trigger/redeploy (or push to `master` for an automatic deploy).
2. Wait for a green build; open the deployment URL (and the staging subdomain if set).

## Step 8 — Verification checklist (on the live staging URL)

- [ ] Home page returns 200 and shows the 6 seeded listings
- [ ] A listing detail page (`/listings/<id>`) returns 200 with title/price/seller
- [ ] Search + a category filter return sensible results (case-insensitive: try a
      lowercase query against a capitalized title — this catches the `ILIKE` port)
- [ ] Register a throwaway account, log out, log back in (session cookie works, `Secure` flag set)
- [ ] Log in as `seller@swim.test` (staging `SEED_PASSWORD`), create a listing **with a photo**:
      photo uploads, displays on the listing (proves R2 + CSP `img-src`), survives a redeploy
- [ ] Log in as `buyer@swim.test`: send the seller a message; make an offer
- [ ] As seller: accept the offer; as buyer: create the order and **Pay (mock)**;
      ship → confirm delivery — order statuses advance, inventory decremented
- [ ] Fee math on the orders page: a shipped order shows 9.9% of (item + shipping,
      never tax) as its platform fee; a local-pickup order shows a $0.00 fee
- [ ] Stripe test mode (once keys are set in Vercel — see "Stripe test mode" below):
      create a PaymentIntent for a pending order, confirm with test card
      4242 4242 4242 4242, then Pay flips the order to paid; without a confirmed
      charge, Pay is refused

## Stripe test mode (wired 2026-11-24, branch `neon-port`)

SWIM's OWN Stripe integration (separate from the Layout.ai restricted key).
Server-side only, behind env flags:

- Migration v3 adds `orders.delivery_method / shipping_cents / tax_cents /
  platform_fee_cents / stripe_payment_intent_id` and `users.tier`
  (`free` | `premium`).
- `createOrder()` computes the locked fee (9.9% shipped free / 6.9% shipped
  premium / 0% local; base = item price paid + shipping, never tax) and stores
  it on the order; the buy form takes delivery method + shipping + tax.
- `POST /api/orders/[id]/payment-intent` (buyer, pending_payment only)
  creates a PaymentIntent for the order total and stores its id; `pay` then
  verifies the intent succeeded before flipping the order to paid. With no
  key configured the route answers 503 and pay stays mock.
- Keys: `STRIPE_SECRET_KEY` (`sk_test_...`) + `STRIPE_PUBLISHABLE_KEY`
  (`pk_test_...`) in Vercel env. The app **refuses live keys** on staging.
  The key is NOT in the repo or the staging env file — the store owner must
  provide the test-mode secret key via the secure flow (never pasted in chat),
  after which it goes into Vercel env only and the staging deploy picks it up.
- Still to build once the key lands: the buyer-facing card-confirm step
  (Stripe.js + publishable key on the orders page) — the server side above is
  done; the card form is the remaining piece.
- [ ] Promo code `WELCOME10` on a direct order shows the 10% discount in `total_cents`
- [ ] Admin login (`admin@swim.test`): admin page loads, moderation actions work
- [ ] Hard refresh / new browser: still logged in (session persisted in Neon, not local state)
- [ ] Vercel function logs show no `better-sqlite3`, filesystem, or DB-connection errors

## Rollback / teardown

- Bad deploy: Vercel → Deployments → promote the previous green deployment (instant).
- Bad data: Neon console → restore/branch from before the seed, or re-run Steps 5–6 on a
  fresh Neon project and swap `DATABASE_URL*` in Vercel.
- Full teardown: delete the Vercel project, Neon project, and R2 bucket — nothing in
  staging is a source of truth; the repo is.

## Known staging limitations (accepted, fix before public launch)

- Rate limiting is in-memory per instance (`src/services/ratelimit.ts`) — resets on cold
  start, not shared across instances. Move to a shared store (e.g. Upstash Redis) later.
- Payments: Stripe test mode is wired server-side behind env flags (see above);
  until test keys are set, checkout stays mock and the platform fee is computed
  and stored on every order but no money moves. The buyer card-confirm UI is
  the remaining piece once the key lands.
- Vercel Hobby is non-commercial — staging/rehearsal only; Pro is required at launch.
