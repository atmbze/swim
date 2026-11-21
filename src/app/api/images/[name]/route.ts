import fs from "fs";
import path from "path";
import { IMAGE_NAME_RE, uploadDir } from "@/services/uploads";
// Local-disk storage mode only (no R2_* env set): serves files from UPLOAD_DIR.
// When R2 is configured, uploads go to the bucket and imageUrl() points
// straight at R2_PUBLIC_BASE_URL, so this route is never used.

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!IMAGE_NAME_RE.test(name)) return new Response("Not found", { status: 404 });
  const p = path.join(uploadDir(), name);
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { "Content-Type": TYPES[name.split(".")[1]], "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
