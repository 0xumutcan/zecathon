// Renders the frame chosen for each of 8 cursor directions (+ center) so the gaze map can be checked by eye.
// usage: node verify-look.mjs <dir> <name> <out.png>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [dir, name, out] = process.argv.slice(2);
const meta = JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8"));
const sheet = join(dir, `${name}.webp`);

// screen directions, y down: center, then clockwise from up-left as a 3x3 grid
const grid = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
const pick = ([dx, dy]) => {
  const len = Math.hypot(dx, dy);
  const t = len ? [dx / len, dy / len] : [0, 0];
  let best = 0, bestD = Infinity;
  meta.gaze.forEach(([gx, gy], i) => {
    const d = (gx - t[0]) ** 2 + (gy - t[1]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
};

const S = 2;
const tiles = await Promise.all(grid.map(async (dir, k) => {
  const i = pick(dir);
  const buf = await sharp(sheet)
    .extract({ left: (i % meta.cols) * meta.frameW, top: Math.floor(i / meta.cols) * meta.frameH, width: meta.frameW, height: Math.round(meta.frameH * 0.55) })
    .resize({ width: meta.frameW * S, kernel: "nearest" })
    .png().toBuffer();
  console.log(`dir ${JSON.stringify(dir)} -> frame ${i}`);
  return { input: buf, left: (k % 3) * meta.frameW * S, top: Math.floor(k / 3) * Math.round(meta.frameH * 0.55) * S };
}));
await sharp({ create: { width: meta.frameW * S * 3, height: Math.round(meta.frameH * 0.55) * S * 3, channels: 4, background: { r: 30, g: 30, b: 45, alpha: 1 } } })
  .composite(tiles).png().toFile(out);
