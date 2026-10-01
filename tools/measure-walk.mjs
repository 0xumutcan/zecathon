// Measures the walk sheet's step period and foot spread to derive a slide-free walking speed.
// usage: node measure-walk.mjs [dir] [name]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [dir = "../public/character", name = "walk"] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const { data, info } = await sharp(join(dir, `${name}.webp`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// feet = opaque pixels in the bottom 12 rows of the character
const spread = [];
for (let i = 0; i < meta.count; i++) {
  const ox = (i % meta.cols) * meta.frameW, oy = Math.floor(i / meta.cols) * meta.frameH;
  let bottom = 0;
  for (let y = meta.frameH - 1; y >= 0 && !bottom; y--)
    for (let x = 0; x < meta.frameW; x++) if (data[((oy + y) * info.width + ox + x) * 4 + 3]) { bottom = y; break; }
  let minX = Infinity, maxX = -Infinity;
  for (let y = bottom - 12; y <= bottom; y++) for (let x = 0; x < meta.frameW; x++) {
    if (data[((oy + y) * info.width + ox + x) * 4 + 3]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  }
  spread.push(maxX - minX);
}
// step period = distance between spread peaks (feet furthest apart happens once per step)
const peaks = [];
for (let i = 2; i < spread.length - 2; i++) {
  if (spread[i] >= Math.max(spread[i - 1], spread[i + 1], spread[i - 2], spread[i + 2]) && spread[i] > (Math.max(...spread) + Math.min(...spread)) / 2) peaks.push(i);
}
const gaps = peaks.slice(1).map((p, k) => p - peaks[k]).filter((g) => g > 3);
const stepFrames = gaps.reduce((a, b) => a + b, 0) / gaps.length;
const footLen = Math.min(...spread); // feet together ~ one shoe length
const stride = Math.max(...spread) - footLen; // how far a planted foot travels back during one step
const speed = stride / (stepFrames / meta.fps);
console.log({ spreadMin: footLen, spreadMax: Math.max(...spread), peaks, stepFrames: +stepFrames.toFixed(1), stride, speedPxPerSec: +speed.toFixed(1) });
