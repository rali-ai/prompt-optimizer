#!/usr/bin/env node
/**
 * Generate original brand assets (SVG, PNG, ICO) for 高词 · GoPrmpt.
 * Aesthetic: Deep Jade (#0F766E -> #115E59) squircle with crisp alabaster geometric G
 * and Warm Copper (#D96B43 -> #F59E0B) 4-point AI spark.
 * Zero external dependencies — uses Node's built-in zlib for PNG compression
 * and supersampled SDF rasterization for crisp anti-aliased icons.
 *
 * Safe to rerun idempotently: `node scripts/generate-brand-assets.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Original geometric brand mark: Deep Jade squircle + geometric G prism + Warm Copper spark
export const BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="gp-jade" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0D9488"/>
      <stop offset="55%" stop-color="#0F766E"/>
      <stop offset="100%" stop-color="#115E59"/>
    </linearGradient>
    <linearGradient id="gp-copper" x1="39" y1="12" x2="54" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D96B43"/>
    </linearGradient>
    <linearGradient id="gp-sheen" x1="10" y1="4" x2="46" y2="42" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FAF9F5" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#FAF9F5" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#gp-jade)"/>
  <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="15.25" stroke="url(#gp-sheen)" stroke-width="1.5"/>
  <!-- Stylized geometric open G prism -->
  <path d="M44.5 23.5A15.5 15.5 0 1 0 47.5 34H33.5" stroke="#FAF9F5" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M33.5 34H47.5V41.5A15.5 15.5 0 0 1 32 47.5" stroke="#CCFBF1" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>
  <!-- Warm Copper 4-point AI spark -->
  <path d="M46.5 12.5L48.3 18.2L54 20L48.3 21.8L46.5 27.5L44.7 21.8L39 20L44.7 18.2Z" fill="url(#gp-copper)"/>
</svg>
`;

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeICO(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);

  return Buffer.concat([header, entry, pngBuffer]);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function sdRoundedBox(px, py, bx, by, r) {
  const qx = Math.abs(px) - bx + r;
  const qy = Math.abs(py) - by + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function isInsideSpark(x, y, cx, cy, R) {
  const dx = Math.abs(x - cx) / R;
  const dy = Math.abs(y - cy) / R;
  if (dx > 1 || dy > 1) return false;
  return Math.pow(dx, 0.54) + Math.pow(dy, 0.54) <= 1.0;
}

function sampleBrandPixel(nx, ny, maskable) {
  const cx = nx - 32;
  const cy = ny - 32;

  const bgDist = maskable ? -10 : sdRoundedBox(cx, cy, 30, 30, 16);
  if (bgDist > 0) {
    return [0, 0, 0, 0];
  }

  // Deep Jade diagonal gradient #0D9488 -> #0F766E -> #115E59
  const t = clamp(((nx - 6) * 0.65 + (ny - 4) * 0.76) / 76, 0, 1);
  let r, g, b;
  if (t < 0.55) {
    const k = t / 0.55;
    r = mix(13, 15, k);
    g = mix(148, 118, k);
    b = mix(136, 110, k);
  } else {
    const k = (t - 0.55) / 0.45;
    r = mix(15, 17, k);
    g = mix(118, 94, k);
    b = mix(110, 89, k);
  }

  // Subtle top-left warm alabaster sheen border
  if (!maskable && bgDist > -1.6) {
    const sheen = clamp(1 - (nx + ny) / 90, 0, 1) * 0.25;
    r = mix(r, 250, sheen);
    g = mix(g, 249, sheen);
    b = mix(b, 245, sheen);
  }

  const gx = maskable ? 32 + (nx - 32) / 0.78 : nx;
  const gy = maskable ? 32 + (ny - 32) / 0.78 : ny;

  // Warm Copper 4-point spark (#F59E0B -> #D96B43)
  if (isInsideSpark(gx, gy, 46.5, 20.0, 7.6)) {
    const sk = clamp(((gx - 39) + (gy - 12.5)) / 30, 0, 1);
    return [
      Math.round(mix(245, 217, sk)),
      Math.round(mix(158, 107, sk)),
      Math.round(mix(11, 67, sk)),
      255,
    ];
  }

  // Geometric G in warm alabaster (#FAF9F5)
  const dx = gx - 32;
  const dy = gy - 32;
  const distC = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const halfStroke = 2.65;

  const inGap = angle > -0.62 && angle < 0.08;
  const onRing = !inGap && Math.abs(distC - 15.5) <= halfStroke;

  const cap1x = 32 + 15.5 * Math.cos(-0.62);
  const cap1y = 32 + 15.5 * Math.sin(-0.62);
  const onCap1 = Math.hypot(gx - cap1x, gy - cap1y) <= halfStroke;

  const dBar = sdSegment(gx, gy, 33.5, 34, 47.2, 34);
  const dDrop = sdSegment(gx, gy, 47.2, 34, 47.2, 39.5);
  const onBar = dBar <= halfStroke || dDrop <= halfStroke;

  if (onRing || onCap1 || onBar) {
    return [250, 249, 245, 255];
  }

  return [Math.round(r), Math.round(g), Math.round(b), 255];
}

function renderBrandPNG(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = size <= 48 ? 4 : 3;
  const invTotal = 1 / (ss * ss);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = ((x + (sx + 0.5) / ss) / size) * 64;
          const ny = ((y + (sy + 0.5) / ss) / size) * 64;
          const [r, g, b, a] = sampleBrandPixel(nx, ny, maskable);
          sr += r * a;
          sg += g * a;
          sb += b * a;
          sa += a;
        }
      }
      const idx = (y * size + x) * 4;
      const alpha = sa * invTotal;
      if (alpha > 0.5) {
        rgba[idx] = Math.round(sr / sa);
        rgba[idx + 1] = Math.round(sg / sa);
        rgba[idx + 2] = Math.round(sb / sa);
        rgba[idx + 3] = Math.round(alpha);
      } else {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
      }
    }
  }
  return encodePNG(size, size, rgba);
}

function writeOut(relPath, content) {
  const full = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log(`  ✓ ${relPath} (${Buffer.byteLength(content)} bytes)`);
}

function main() {
  console.log('Generating 高词 · GoPrmpt (Warm Jade + Copper) brand assets...');

  writeOut('site/public/images/logo.svg', BRAND_SVG);
  writeOut('site/public/favicon.svg', BRAND_SVG);
  writeOut('packages/ui/src/assets/logo.svg', BRAND_SVG);
  writeOut('packages/web/public/favicon.svg', BRAND_SVG);

  const png16 = renderBrandPNG(16);
  const png32 = renderBrandPNG(32);
  const png48 = renderBrandPNG(48);
  const png64 = renderBrandPNG(64);
  const png128 = renderBrandPNG(128);
  const png180 = renderBrandPNG(180);
  const png192 = renderBrandPNG(192);
  const png256 = renderBrandPNG(256);
  const png512 = renderBrandPNG(512);
  const pngMaskable512 = renderBrandPNG(512, { maskable: true });

  const ico32 = encodeICO(png32, 32);

  writeOut('site/public/images/logo.png', png256);
  writeOut('site/public/images/favicon.png', png64);
  writeOut('packages/ui/src/assets/logo.png', png128);

  writeOut('packages/web/public/favicon.ico', ico32);
  writeOut('packages/web/public/pwa/apple-touch-icon.png', png180);
  writeOut('packages/web/public/pwa/icon-192.png', png192);
  writeOut('packages/web/public/pwa/icon-512.png', png512);
  writeOut('packages/web/public/pwa/maskable-512.png', pngMaskable512);

  writeOut('packages/extension/public/icons/icon16.png', png16);
  writeOut('packages/extension/public/icons/icon32.png', png32);
  writeOut('packages/extension/public/icons/icon48.png', png48);
  writeOut('packages/extension/public/icons/icon128.png', png128);
  writeOut('packages/extension/public/favicon.ico', ico32);

  console.log('Done! All 高词 · GoPrmpt brand assets generated.');
}

main();
