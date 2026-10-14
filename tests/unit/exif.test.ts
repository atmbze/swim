import { describe, expect, it } from "vitest";
import { stripMetadata } from "@/services/exif";

const seg = (marker: number, payload: Buffer) => { const h = Buffer.alloc(4); h[0] = 0xff; h[1] = marker; h.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([h, payload]); };
function pngChunk(type: string, data: Buffer) { const h = Buffer.alloc(8); h.writeUInt32BE(data.length, 0); h.write(type, 4, "latin1"); return Buffer.concat([h, data, Buffer.alloc(4)]); }
function riffChunk(fourcc: string, data: Buffer) { const h = Buffer.alloc(8); h.write(fourcc, 0, "latin1"); h.writeUInt32LE(data.length, 4); return Buffer.concat([h, data, data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); }

describe("EXIF stripping", () => {
  it("removes APP1 EXIF (GPS) from JPEG but keeps JFIF and scan data", () => {
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from("JFIF\0")), seg(0xe1, Buffer.from("Exif\0\0GPS-37.7749")), seg(0xfe, Buffer.from("comment")),
      Buffer.from([0xff, 0xda, 0x00, 0x04, 1, 2]), Buffer.from("SCANDATA"), Buffer.from([0xff, 0xd9])]);
    const out = stripMetadata(jpg, "jpg")!;
    expect(out.includes("GPS")).toBe(false); expect(out.includes("comment")).toBe(false);
    expect(out.includes("JFIF")).toBe(true); expect(out.includes("SCANDATA")).toBe(true);
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });
  it("removes eXIf/tEXt chunks from PNG", () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", Buffer.alloc(13)), pngChunk("eXIf", Buffer.from("GPSDATA")), pngChunk("tEXt", Buffer.from("Author\0me")), pngChunk("IDAT", Buffer.from("PIX")), pngChunk("IEND", Buffer.alloc(0))]);
    const out = stripMetadata(png, "png")!;
    expect(out.includes("GPSDATA")).toBe(false); expect(out.includes("Author")).toBe(false);
    expect(out.includes("IHDR")).toBe(true); expect(out.includes("PIX")).toBe(true); expect(out.includes("IEND")).toBe(true);
  });
  it("removes EXIF/XMP from WebP, clears VP8X flags and fixes RIFF size", () => {
    const vp8x = Buffer.alloc(10); vp8x[0] = 0x08 | 0x04;
    const body = Buffer.concat([riffChunk("VP8X", vp8x), riffChunk("VP8 ", Buffer.from("IMG")), riffChunk("EXIF", Buffer.from("GPSDATA")), riffChunk("XMP ", Buffer.from("<x/>"))]);
    const head = Buffer.alloc(12); head.write("RIFF", 0); head.writeUInt32LE(body.length + 4, 4); head.write("WEBP", 8);
    const out = stripMetadata(Buffer.concat([head, body]), "webp")!;
    expect(out.includes("GPSDATA")).toBe(false); expect(out.includes("<x/>")).toBe(false); expect(out.includes("IMG")).toBe(true);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out[20] & 0x0c).toBe(0);
  });
  it("returns null for malformed JPEG", () => {
    expect(stripMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1]), "jpg")).toBeNull();
  });
});
