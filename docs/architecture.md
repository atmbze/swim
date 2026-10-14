# Architecture
Request → `src/app/api/**/route.ts` → `route()` wrapper (`src/services/http.ts`: Origin check on mutations, AppError/ZodError → JSON status) → domain service in `src/services/*` → SQLite (`better-sqlite3`, WAL, foreign keys on).

Pages are server components that call the same services directly (reads) and use `<ApiForm>` (client) to POST to the API (writes), so all authorization is enforced in the services/route layer, never in the UI.

## State machines
- Offer: `pending → accepted | rejected` (seller), `pending|accepted → withdrawn` (buyer), `accepted → ordered` (buyer checks out).
- Order: `pending_payment → paid` (buyer, MOCK) `→ shipped` (seller) `→ delivered` (buyer). `pending_payment → cancelled` (either party); `paid → cancelled` (seller only, mock refund). Inventory is reserved on order creation with a conditional `UPDATE ... WHERE quantity >= ?` inside a transaction and restored on cancel.
- BuyBacker: `submitted → accepted(quote) | rejected` (admin) or `withdrawn` (owner).

## Data
Tables: users, sessions, listings, flags, messages, offers, orders, buyback_requests, promotions (see `src/services/db.ts`). Images stored on local disk (`UPLOAD_DIR`) under random names and served by `/api/images/[name]` with a strict name regex.
