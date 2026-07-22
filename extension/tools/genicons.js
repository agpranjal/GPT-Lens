// Regenerates the toolbar icons (transparent-background orange bolt) at all
// sizes. Shape mirrors tools/bolt.svg. Run from the extension dir:
//   node tools/genicons.js icons
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

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

// Material "flash_on" bolt: M7 2v11h3v9l7-12h-4l4-8z  (24x24 grid)
const poly = [
  [7, 2], [7, 13], [10, 13], [10, 22], [17, 10], [13, 10], [17, 2],
];
const bx0 = 7, bx1 = 17, by0 = 2, by1 = 22; // bolt bounding box

function pointInPoly(x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// gradient top -> bottom
const top = [0xff, 0xd5, 0x4a];
const bot = [0xff, 0x7a, 0x00];

function render(size) {
  const SS = 4;                 // supersample
  const S = size * SS;
  const pad = 0.07;             // fraction padding
  const boltW = bx1 - bx0, boltH = by1 - by0;
  const avail = S * (1 - 2 * pad);
  const scale = Math.min(avail / boltW, avail / boltH);
  const drawW = boltW * scale, drawH = boltH * scale;
  const offX = (S - drawW) / 2, offY = (S - drawH) / 2;

  const hi = Buffer.alloc(S * S * 4);
  for (let py = 0; py < S; py++) {
    // map pixel -> bolt coord
    const by = (py - offY) / scale + by0;
    const t = Math.min(1, Math.max(0, (by - by0) / boltH));
    const r = Math.round(top[0] + (bot[0] - top[0]) * t);
    const g = Math.round(top[1] + (bot[1] - top[1]) * t);
    const b = Math.round(top[2] + (bot[2] - top[2]) * t);
    for (let px = 0; px < S; px++) {
      const bxc = (px - offX) / scale + bx0;
      const idx = (py * S + px) * 4;
      if (pointInPoly(bxc, by)) {
        hi[idx] = r; hi[idx + 1] = g; hi[idx + 2] = b; hi[idx + 3] = 255;
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
