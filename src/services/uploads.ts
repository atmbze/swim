import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { badRequest } from "./errors";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const uploadDir = () => process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
export const IMAGE_NAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;
const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Storage mode is chosen by env: when the R2_* vars are set, images go to
 * Cloudflare R2 (S3-compatible) and are served from R2_PUBLIC_BASE_URL;
 * otherwise (local dev, tests) they are written to UPLOAD_DIR on disk and
 * served by src/app/api/images/[name]/route.ts. The stored value is always
 * just the file name (<32 hex>.<ext>) either way.
 */
export const r2Configured = () =>
  !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);

let s3: S3Client | null = null;
function r2Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
  }
  return s3;
}

/** Public URL for a stored image name, per the active storage mode. */
export function imageUrl(name: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL;
  if (r2Configured() && base) return `${base.replace(/\/$/, "")}/${name}`;
  return `/api/images/${name}`;
}

/** Detect type from magic bytes; never trust the client-supplied MIME type or filename. */
export function sniffImage(buf: Buffer): "jpg" | "png" | "webp" | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "webp";
  return null;
}

export async function saveImage(file: unknown): Promise<string | null> {
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) return null;
  const f = file as File;
  if (f.size === 0) return null;
  if (f.size > MAX_IMAGE_BYTES) throw badRequest("Image too large (max 2 MB)");
  const buf = Buffer.from(await f.arrayBuffer());
  const ext = sniffImage(buf);
  if (!ext) throw badRequest("Image must be JPEG, PNG or WebP");
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  if (r2Configured()) {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: name,
        Body: buf,
        ContentType: CONTENT_TYPES[ext],
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  } else {
    fs.mkdirSync(uploadDir(), { recursive: true });
    fs.writeFileSync(path.join(uploadDir(), name), buf);
  }
  return name;
}

export async function deleteImage(name: string | null) {
  if (!name || !IMAGE_NAME_RE.test(name)) return;
  if (r2Configured()) {
    await r2Client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: name }));
  } else {
    fs.rmSync(path.join(uploadDir(), name), { force: true });
  }
}
