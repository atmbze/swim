import crypto from "crypto";
import fs from "fs";
import path from "path";
import { badRequest } from "./errors";
import { stripMetadata } from "./exif";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const uploadDir = () => process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
export const IMAGE_NAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

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
  const clean = stripMetadata(buf, ext);
  if (!clean) throw badRequest("Image file is corrupt");
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  fs.mkdirSync(uploadDir(), { recursive: true });
  fs.writeFileSync(path.join(uploadDir(), name), clean);
  return name;
}

export function deleteImage(name: string | null) {
  if (name && IMAGE_NAME_RE.test(name)) fs.rmSync(path.join(uploadDir(), name), { force: true });
}
