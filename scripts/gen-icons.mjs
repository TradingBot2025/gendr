// Dependency-free PNG app-icon generator (heart on brand purple).
// Run: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function png(size, pixelFn) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y, size);
      const idx = (y * size + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
  // Add filter byte (0) at the start of each scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Brand colors
const BG = [124, 58, 237]; // #7c3aed
const FG = [255, 255, 255];

// Heart implicit: (x^2 + y^2 - 1)^3 - x^2*y^3 <= 0, in a normalized space.
function inHeart(nx, ny) {
  // nx, ny in roughly [-1.3, 1.3]; invert y so the heart points down.
  const x = nx;
  const y = -ny;
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

function makePixel({ padding = 0.18 } = {}) {
  return (px, py, size) => {
    // Rounded-square purple background with corner radius.
    const radius = size * 0.22;
    const cx = Math.min(Math.max(px, radius), size - radius);
    const cy = Math.min(Math.max(py, radius), size - radius);
    const dx = px - cx;
    const dy = py - cy;
    const outside = dx * dx + dy * dy > radius * radius;
    if (outside) return [0, 0, 0, 0];

    // Map to heart space centered, scaled to leave padding.
    const scale = (size * (1 - padding * 2)) / 2;
    const nx = (px - size / 2) / scale;
    const ny = (py - size / 2) / scale;
    const col = inHeart(nx, ny * 1.05) ? FG : BG;
    return [col[0], col[1], col[2], 255];
  };
}

const out = process.argv[2] || "public";
writeFileSync(`${out}/icon-192.png`, png(192, makePixel()));
writeFileSync(`${out}/icon-512.png`, png(512, makePixel({ padding: 0.2 })));
writeFileSync(`${out}/apple-touch-icon.png`, png(180, makePixel({ padding: 0.12 })));
console.log("Wrote icon-192.png, icon-512.png, apple-touch-icon.png");
