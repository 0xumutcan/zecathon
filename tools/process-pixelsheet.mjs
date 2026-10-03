// Turns an AI-made low-res pixel-art pose sheet (poses in one row on green) into a clean sprite sheet:
// keys out the green, splits the poses, finds the real pixel grid, and aligns every pose on one baseline.
// usage: node process-pixelsheet.mjs <input.png> <name> [--out dir] [--colors n] [--despill]
//   --despill: also drop bright green-tinted pixels, where see-through glow was painted over the green
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const [input, name] = argv;
const outDir = resolve(flag("out", "../public/actors"));
const colors = Number(flag("colors", 16));

const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const despill = argv.includes("--despill");
const isBg = (i) => (data[i + 1] > 150 && data[i + 1] - data[i] > 60 && data[i + 1] - data[i + 2] > 60)
  || (despill && data[i + 1] > 120 && data[i + 1] - data[i] > 12 && data[i + 1] - data[i + 2] > 40);

// split poses on empty columns
const colHas = new Array(W).fill(false);
let top = H, bottom = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!isBg((y * W + x) * 3)) { colHas[x] = true; top = Math.min(top, y); bottom = Math.max(bottom, y); }
}
const spans = [];
for (let x = 0; x < W; x++) {
  if (colHas[x] && (x === 0 || !colHas[x - 1])) spans.push([x, x]);
  if (colHas[x]) spans[spans.length - 1][1] = x;
}
const poses = spans.filter(([a, b]) => b - a > W * 0.03); // ignore stray specks (e.g. tiny dust marks)

// Real pixel grid: color edges of a true grid all fall on multiples of the period, so the period's
// Fourier score over edge positions is ~1. Divisors of the period score high too, so take the largest
// period that scores close to the best one. The phase of that score tells where the grid starts.
const diff = (i, j) => Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]);
const edgesX = [], edgesY = [];
for (let y = top; y <= bottom; y++) for (let x = 1; x < W; x++) {
  const i = (y * W + x) * 3;
  if (diff(i, i - 3) > 60) edgesX.push(x);
  if (y > top && diff(i, i - W * 3) > 60) edgesY.push(y);
}
const score = (edges, p) => {
  let re = 0, im = 0;
  for (const e of edges) { const a = (2 * Math.PI * e) / p; re += Math.cos(a); im += Math.sin(a); }
  return { s: Math.hypot(re, im) / edges.length, phase: ((Math.atan2(im, re) / (2 * Math.PI)) * p + p) % p };
};
const scores = [];
for (let p = 5; p <= 40; p += 0.05) {
  const sx = score(edgesX, p), sy = score(edgesY, p);
  scores.push({ p, s: (sx.s + sy.s) / 2, phaseX: sx.phase, phaseY: sy.phase });
}
const top1 = Math.max(...scores.map((c) => c.s));
const grid = Number(flag("px", 0))
  ? scores.reduce((a, c) => (Math.abs(c.p - Number(flag("px"))) < Math.abs(a.p - Number(flag("px"))) ? c : a))
  : scores.filter((c) => c.s >= top1 * 0.85).reduce((a, c) => (c.p > a.p ? c : a));
if (process.env.DEBUG) console.log(scores.filter((c, i) => i % 10 === 0).map((c) => `${c.p.toFixed(1)}:${c.s.toFixed(2)}`).join(" "));
const bestPx = grid.p;

// native frames: sample each grid cell at its center so edges stay hard
const frames = [];
const cy0 = Math.floor((top - grid.phaseY) / bestPx);
for (const [a, b] of poses) {
  const cx0 = Math.floor((a - grid.phaseX) / bestPx);
  const w = Math.ceil((b + 1 - grid.phaseX) / bestPx) - cx0, h = Math.ceil((bottom + 1 - grid.phaseY) / bestPx) - cy0;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(W - 1, Math.max(0, Math.round(grid.phaseX + (cx0 + x + 0.5) * bestPx)));
    const sy = Math.min(H - 1, Math.max(0, Math.round(grid.phaseY + (cy0 + y + 0.5) * bestPx)));
    const i = (sy * W + sx) * 3, o = (y * w + x) * 4;
    if (isBg(i)) continue;
    buf[o] = data[i]; buf[o + 1] = data[i + 1]; buf[o + 2] = data[i + 2]; buf[o + 3] = 255;
  }
  frames.push({ buf, w, h });
}

// every pose shares one frame size; feet on the bottom row, horizontally centered on the body mass
const FW = Math.max(...frames.map((f) => f.w)) + 4, FH = Math.max(...frames.map((f) => f.h)) + 2;
const composites = [];
frames.forEach(({ buf, w, h }, k) => {
  let lowest = 0, sx = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (buf[(y * w + x) * 4 + 3]) { lowest = Math.max(lowest, y); sx += x; n++; }
  composites.push({ buf, w, h, left: k * FW + Math.round(FW / 2 - sx / n), top: FH - 1 - lowest });
});
let sheet = await sharp({ create: { width: FW * frames.length, height: FH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(await Promise.all(composites.map(async (c) => ({
    input: await sharp(c.buf, { raw: { width: c.w, height: c.h, channels: 4 } }).png().toBuffer(), left: c.left, top: c.top,
  }))))
  .png().toBuffer();
sheet = await sharp(sheet).png({ palette: true, colours: colors, dither: 0 }).toBuffer();
await sharp(sheet).toFile(join(outDir, `${name}.png`));
writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ frameW: FW, frameH: FH, count: frames.length }));
console.log(`${name}: ${frames.length} poses, source px/art px ${bestPx}, frame ${FW}x${FH}`);
