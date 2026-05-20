import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = path.join(root, 'assets');
fs.mkdirSync(assetDir, { recursive: true });

const sizes = [256, 128, 64, 48, 32, 16];

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function rgba(hex, alpha = 255) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
    a: alpha,
  };
}

function blend(base, top) {
  const alpha = top.a / 255;
  const inv = 1 - alpha;
  return {
    r: Math.round(top.r * alpha + base.r * inv),
    g: Math.round(top.g * alpha + base.g * inv),
    b: Math.round(top.b * alpha + base.b * inv),
    a: Math.round(top.a + base.a * inv),
  };
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const cx = clamp(x, left + radius, right - radius);
  const cy = clamp(y, top + radius, bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const pi = points[i];
    const pj = points[j];
    const intersects =
      pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function arcAlpha(x, y, cx, cy, radius, width, startDeg, endDeg) {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  const inAngle =
    startDeg <= endDeg
      ? angle >= startDeg && angle <= endDeg
      : angle >= startDeg || angle <= endDeg;
  if (!inAngle) return 0;
  return clamp(1 - Math.abs(dist - radius) / width);
}

function sampleColor(x, y) {
  if (!insideRoundedRect(x, y, 0.06, 0.06, 0.94, 0.94, 0.18)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const top = rgba('#17232e');
  const bottom = rgba('#184a43');
  const t = clamp((x + y) / 1.8);
  let color = {
    r: mix(top.r, bottom.r, t),
    g: mix(top.g, bottom.g, t),
    b: mix(top.b, bottom.b, t),
    a: 255,
  };

  const arcColor = rgba('#7ee5c5', 230);
  for (const radius of [0.24, 0.34, 0.44]) {
    const alpha = arcAlpha(x, y, 0.5, 0.58, radius, 0.018, 218, 322);
    if (alpha > 0) color = blend(color, { ...arcColor, a: Math.round(arcColor.a * alpha) });
  }

  const outerFlame = [
    { x: 0.5, y: 0.21 },
    { x: 0.67, y: 0.47 },
    { x: 0.62, y: 0.75 },
    { x: 0.5, y: 0.86 },
    { x: 0.38, y: 0.75 },
    { x: 0.33, y: 0.47 },
  ];
  if (insidePolygon(x, y, outerFlame)) {
    const flameTop = rgba('#ffdf7e');
    const flameBottom = rgba('#e7662d');
    const ft = clamp((y - 0.21) / 0.65);
    color = {
      r: mix(flameTop.r, flameBottom.r, ft),
      g: mix(flameTop.g, flameBottom.g, ft),
      b: mix(flameTop.b, flameBottom.b, ft),
      a: 255,
    };
  }

  const innerFlame = [
    { x: 0.51, y: 0.44 },
    { x: 0.59, y: 0.61 },
    { x: 0.54, y: 0.76 },
    { x: 0.46, y: 0.77 },
    { x: 0.42, y: 0.61 },
  ];
  if (insidePolygon(x, y, innerFlame)) {
    color = blend(color, rgba('#fff6ce', 235));
  }

  if (insideRoundedRect(x, y, 0.37, 0.78, 0.63, 0.83, 0.025)) {
    color = blend(color, rgba('#102019', 180));
  }

  return color;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(size) {
  const scale = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const color = sampleColor(
            (x + (sx + 0.5) / scale) / size,
            (y + (sy + 0.5) / scale) / size,
          );
          r += color.r;
          g += color.g;
          b += color.b;
          a += color.a;
        }
      }
      const samples = scale * scale;
      raw[offset++] = Math.round(r / samples);
      raw[offset++] = Math.round(g / samples);
      raw[offset++] = Math.round(b / samples);
      raw[offset++] = Math.round(a / samples);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let imageOffset = 6 + images.length * 16;
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry[0] = image.size === 256 ? 0 : image.size;
    entry[1] = image.size === 256 ? 0 : image.size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.data.length, 8);
    entry.writeUInt32LE(imageOffset, 12);
    entries.push(entry);
    imageOffset += image.data.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

const images = sizes.map((size) => ({ size, data: png(size) }));
fs.writeFileSync(path.join(assetDir, 'signal-fire.png'), images[0].data);
fs.writeFileSync(path.join(assetDir, 'signal-fire.ico'), ico(images));
