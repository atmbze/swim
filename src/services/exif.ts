/** Strip EXIF/XMP/text metadata (incl. GPS) from JPEG, PNG and WebP without re-encoding. Returns null if the file is malformed. */
export function stripMetadata(buf: Buffer, type: "jpg" | "png" | "webp"): Buffer | null {
  try {
    if (type === "jpg") return stripJpeg(buf);
    if (type === "png") return stripPng(buf);
    return stripWebp(buf);
  } catch { return null; }
}

function stripJpeg(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error("bad marker");
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); break; } // start of scan: rest is image data
    if (marker === 0xd9) { out.push(buf.subarray(i, i + 2)); break; }
    if (marker >= 0xd0 && marker <= 0xd7) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new Error("bad segment");
    // Drop APP1 (EXIF/XMP), APP13 (IPTC/Photoshop) and COM; keep APP0 (JFIF), APP2 (ICC), APP14, tables.
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(out);
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
function stripPng(buf: Buffer): Buffer {
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + len;
    if (end > buf.length) throw new Error("bad chunk");
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(out);
}

function stripWebp(buf: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const fourcc = buf.subarray(i, i + 4).toString("latin1");
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size & 1);
    if (i + 8 + size > buf.length) throw new Error("bad chunk");
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const c = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
      if (fourcc === "VP8X") c[8] &= ~(0x08 | 0x04); // clear EXIF and XMP flags
      chunks.push(c);
    }
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1"); header.writeUInt32LE(body.length + 4, 4); header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}
