// Regenerates the toolbar icons (transparent-background lens + sparkle) at all
// sizes. Shape mirrors tools/lens.svg. Run from the extension dir:
//   node tools/genicons.js icons
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

// CRC32
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sparkle = [
  [12.25, 5.25], [12.8, 7.2], [14.75, 7.75], [12.8, 8.3],
  [12.25, 10.25], [11.7, 8.3], [9.75, 7.75], [11.7, 7.2],
];

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

const blue = [0x8a, 0xb4, 0xf8];
const white = [0xee, 0xf5, 0xff];

function render(size) {
  const SS = 4;                 // supersample
  const S = size * SS;
  const hi = Buffer.alloc(S * S * 4);
  for (let py = 0; py < S; py++) {
    const y = (py + 0.5) * 24 / S;
    for (let px = 0; px < S; px++) {
      const x = (px + 0.5) * 24 / S;
      const idx = (py * S + px) * 4;
      const ring = Math.abs(Math.hypot(x - 10.25, y - 10.25) - 6.25) <= 1.125;
      const handle = distanceToSegment(x, y, 14.8, 14.8, 19.85, 19.85) <= 1.125;
      const isSparkle = pointInPoly(x, y, sparkle);
      if (ring || handle || isSparkle) {
        const color = isSparkle ? white : blue;
        hi[idx] = color[0]; hi[idx + 1] = color[1]; hi[idx + 2] = color[2]; hi[idx + 3] = 255;
      }
    }
  }

  // downsample SSxSS -> average (premultiplied for clean edges)
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ar = 0, ag = 0, ab = 0, aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + (x * SS + sx)) * 4;
          const a = hi[i + 3];
          ar += hi[i] * a; ag += hi[i + 1] * a; ab += hi[i + 2] * a; aa += a;
        }
      }
      const o = (y * size + x) * 4;
      const n = SS * SS;
      const alpha = aa / n;
      out[o + 3] = Math.round(alpha);
      if (aa > 0) {
        out[o] = Math.round(ar / aa);
        out[o + 1] = Math.round(ag / aa);
        out[o + 2] = Math.round(ab / aa);
      }
    }
  }
  return encodePNG(size, size, out);
}

const outDir = process.argv[2];
for (const size of [16, 32, 48, 128]) {
  const buf = render(size);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), buf);
  console.log(`wrote icon${size}.png (${buf.length} bytes)`);
}
