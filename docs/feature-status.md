# Feature status
Authoritative matrix: ASSESSMENT.md §3; latest changes in §0.

Fixed on `fix/known-defects` (all with tests that ran and passed):
1. Offer acceptance reserves stock (released on withdraw / order cancel).
2. Orders on moderated (removed / banned-seller) listings can't be paid or shipped; cancel only.
3. Promo codes have a per-buyer limit (default 1; 0 = unlimited).
4. Service worker caches only public pages; logout wipes Cache Storage (+ `Clear-Site-Data`).
5. Missing pages return HTTP 404.
6. Login/register rate limiting (in-memory, HTTP 429).
7. EXIF/XMP/text metadata stripped from JPEG/PNG/WebP uploads.

Still open: CSP, rate limits on other endpoints, pagination, migrations framework, accepted-offer expiry, ZIP coverage, unverified browser UI paths (see ASSESSMENT.md §3/§7).
