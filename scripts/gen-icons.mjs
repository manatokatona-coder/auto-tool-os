/**
 * ホーム画面用のPNGアイコンを生成する。
 *
 * iOSの「ホーム画面に追加」はSVGのアイコンを読まないので、PNGが要る。
 * 外部ライブラリを足したくないので、図形をピクセルに落として自前でPNGを書き出している。
 * 形は web/icon.svg と同じ（赤い角丸に白い R とドット）。
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- PNG出力 */

const CRC_TABLE = (() => {
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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // フィルタなし
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ 作図 */

/** 角丸長方形の内側か。座標は512基準。 */
function inRoundedRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x <= w - r) || (y >= r && y <= h - r);
}

/** 太さのある線分の内側か。 */
function inThickLine(x, y, x1, y1, x2, y2, thickness) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return (x - px) ** 2 + (y - py) ** 2 <= (thickness / 2) ** 2;
}

/** 512基準の座標で「白を塗るか」を返す。文字は R をステム・ボウル・レッグで組み立てている。 */
function isInk(x, y) {
  // ステム（縦棒）
  if (x >= 150 && x <= 208 && y >= 132 && y <= 380) return true;

  // ボウル（Rの上の輪）。外円と内円の差分を、右半分かつ上半分に限って使う。
  const bx = 208;
  const by = 207;
  const dOuter = Math.hypot(x - bx, y - by);
  if (x >= bx && y >= 132 && y <= 282 && dOuter <= 75 && dOuter >= 75 - 50) return true;

  // レッグ（右下へ伸びる脚）
  if (inThickLine(x, y, 232, 265, 300, 380, 56)) return true;

  // 右下のドット
  if (Math.hypot(x - 352, y - 372) <= 26) return true;

  return false;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  const SS = 3; // スーパーサンプリングで縁を滑らかにする

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgHits = 0;
      let inkHits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * scale;
          const y = (py + (sy + 0.5) / SS) * scale;
          if (!inRoundedRect(x, y, 512, 512, 112)) continue;
          bgHits++;
          if (isInk(x, y)) inkHits++;
        }
      }
      const total = SS * SS;
      const alpha = bgHits / total;
      const ink = inkHits / total;
      const i = (py * size + px) * 4;
      // 赤地の上に白を重ねる
      rgba[i] = Math.round(191 + (255 - 191) * (ink / Math.max(alpha, 1e-6)) * alpha);
      rgba[i + 1] = Math.round(0 + 255 * ink);
      rgba[i + 2] = Math.round(0 + 255 * ink);
      rgba[i + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const outDir = join(ROOT, 'web');
mkdirSync(outDir, { recursive: true });
for (const size of [180, 192, 512]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log(`書き出し: web/icon-${size}.png`);
}
