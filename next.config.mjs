/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";
// Listing photos are served from Cloudflare R2 when R2_PUBLIC_BASE_URL is set;
// its origin must be allowed by CSP img-src or the app blocks its own images.
let r2Origin = "";
try {
  if (process.env.R2_PUBLIC_BASE_URL) r2Origin = ` ${new URL(process.env.R2_PUBLIC_BASE_URL).origin}`;
} catch { /* ignore malformed env; images fall back to same-origin */ }
// Production CSP. script-src must allow 'unsafe-inline': Next.js App Router
// inlines its flight/startup scripts, and blocking them breaks hydration —
// the SSR page flashes, then React unmounts to a blank white screen
// (reproduced on the Vercel staging deploy, 2026-11-23). The stricter
// nonce-based CSP lives on branch port/promo-limit-exif and is the
// pre-launch hardening path; 'unsafe-inline' is the staging fix.
// Dev additionally allows 'unsafe-eval' for Next.js HMR.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${r2Origin}`,
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");
export default {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Content-Security-Policy", value: csp },
    ] }];
  },
};
