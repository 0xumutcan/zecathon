// Prepares an AI background for the page: full-res image, the walkable ground line,
// the red camera lights (positions + a "lights off" copy so they can blink).
// usage: node process-bg.mjs <input.png> <name> [--out dir] [--hole x,y]
//   --hole: a point inside a dark opening (a burrow, a doorway); its shape is exported as a mask so actors
//           can be clipped to it when they go "in"
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const [input, name] = argv;
const outDir = resolve(flag("out", "../public/env"));
const holeSeed = flag("hole")?.split(",").map(Number);

const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const luma = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

// ground = the curb's lit top face: the biggest dark -> bright jump between row averages in the lower quarter.
// Rows are averaged in bands of 4 so single noisy rows don't win.
const band = 4;
const rowL = (y) => {
  let l = 0;
  for (let yy = y; yy < y + band; yy++) for (let x = 0; x < w; x++) l += luma((yy * w + x) * 3);
  return l / (w * band);
};
let edge = 0, bestJump = -Infinity;
for (let y = Math.round(h * 0.75); y < h - 2 * band; y += 2) {
  const jump = rowL(y + band) - rowL(y);
  if (jump > bestJump) { bestJump = jump; edge = y + band; }
}
const groundY = edge + Math.round(h * 0.017); // middle of the top face, not its front edge

// red camera lights: saturated red pixels, clustered on a coarse grid
const isRed = (i) => data[i] > 140 && data[i] - data[i + 1] > 70 && data[i] - data[i + 2] > 60;
const CELL = 12, gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL);
const cells = new Uint16Array(gw * gh);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isRed((y * w + x) * 3)) cells[Math.floor(y / CELL) * gw + Math.floor(x / CELL)]++;
const seen = new Uint8Array(gw * gh);
const lights = [];
for (let c = 0; c < cells.length; c++) {
  if (cells[c] < 3 || seen[c]) continue;
  const stack = [c]; seen[c] = 1;
  let sx = 0, sy = 0, n = 0, minX = Infinity, maxX = 0, minY = Infinity, maxY = 0;
  while (stack.length) {
    const k = stack.pop(), cx = k % gw, cy = Math.floor(k / gw);
    sx += cx * cells[k]; sy += cy * cells[k]; n += cells[k];
    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = cx + dx, ny = cy + dy, nk = ny * gw + nx;
      if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && !seen[nk] && cells[nk] >= 1) { seen[nk] = 1; stack.push(nk); }
    }
  }
  if (n < 8) continue; // stray reddish speck
  lights.push({
    x: Math.round((sx / n + 0.5) * CELL), y: Math.round((sy / n + 0.5) * CELL),
    r: Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * CELL / 2 + CELL),
  });
}

// "off" copy: the red lens and its pink halo turn into a dim grey lens
const off = Buffer.from(data);
for (let i = 0; i < off.length; i += 3) {
  const red = off[i] - Math.max(off[i + 1], off[i + 2]);
  if (red > 25) {
    const g = luma(i) * 0.55;
    const t = Math.min(1, (red - 25) / 60); // blend so the halo fades out instead of leaving a hard ring
    off[i] = off[i] * (1 - t) + g * t; off[i + 1] = off[i + 1] * (1 - t) + g * t; off[i + 2] = off[i + 2] * (1 - t) + g * t;
  }
}

// opening mask: flood fill the dark region around the seed
let hole = null;
if (holeSeed) {
  const dark = (x, y) => luma((y * w + x) * 3) < 48;
  const seen = new Uint8Array(w * h);
  const stack = [[holeSeed[0], holeSeed[1]]];
  let minX = w, maxX = 0, minY = h, maxY = 0;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x] || !dark(x, y)) continue;
    seen[y * w + x] = 1;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const mw = maxX - minX + 1, mh = maxY - minY + 1;
  const mask = Buffer.alloc(mw * mh * 4);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    if (seen[(y + minY) * w + x + minX]) mask[(y * mw + x) * 4 + 3] = 255;
  }
  // close pinholes from stray lighter pixels inside the opening
  const closed = await sharp(mask, { raw: { width: mw, height: mh, channels: 4 } }).blur(2).png().toBuffer();
  const { data: cd } = await sharp(closed).raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < cd.length; i += 4) cd[i] = cd[i] > 90 ? 255 : 0;
  await sharp(cd, { raw: { width: mw, height: mh, channels: 4 } }).png().toFile(join(outDir, `${name}_hole.png`));
  hole = { x: minX, y: minY, w: mw, h: mh };
}

await sharp(data, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 90 }).toFile(join(outDir, `${name}.webp`));
await sharp(off, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 90 }).toFile(join(outDir, `${name}_off.webp`));
writeFileSync(join(outDir, `${name}.json`), JSON.stringify({ w, h, groundY, lights, hole }));
if (hole) console.log(`hole mask ${hole.w}x${hole.h} at ${hole.x},${hole.y}`);
console.log(`${name}: ${w}x${h}, groundY ${groundY} (${(groundY / h * 100).toFixed(1)}%), ${lights.length} lights`);
console.log(lights.map((l) => `(${l.x},${l.y} r${l.r})`).join(" "));
