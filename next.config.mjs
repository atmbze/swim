/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";
// Listing photos are served from Cloudflare R2 when R2_PUBLIC_BASE_URL is set;
// its origin must be allowed by CSP img-src or the app blocks its own images.
let r2Origin = "";
try {
  if (process.env.R2_PUBLIC_BASE_URL) r2Origin = ` ${new URL(process.env.R2_PUBLIC_BASE_URL).origin}`;
} catch { /* ignore malformed env; images fall back to same-origin */ }
// Production: strict CSP. Dev: allow 'unsafe-eval' for Next.js HMR.
const csp = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ""}`,
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
