// Converts a green-screen sprite video into a pixel-art sprite sheet (+ gaze map for look-around videos).
// usage: node process-sprite.mjs <input.mp4> <name> [--out dir] [--mode look|loop] [--match name | --height px]
//                                [--canvas WxH] [--colors n]
//   --mode look: one head sweep; writes a per-frame gaze vector so the page can pick a frame for any cursor direction
//   --mode loop: walk/hop/idle loop; the duplicated end frame is dropped so the loop is seamless
//   --match: scale so the body height equals an already processed sprite's (keeps one character consistent)
//   --height: scale so the body is this many art pixels tall (other actors, sized relative to the character)
//   --canvas: frame size in art pixels (default 200x260, the character's shared canvas)
//   --colors: reduce the whole sheet to one shared palette, for a crunchier pixel look and smaller files
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const [input, name] = argv;
const outDir = resolve(flag("out", "../public/character"));
const mode = flag("mode", "look");
const matchName = flag("match");
const targetH = flag("height") && Number(flag("height"));
const colors = flag("colors") && Number(flag("colors"));
const NATIVE_W = 180; // 1440px source / 8
const [CANVAS_W, CANVAS_H] = flag("canvas", "200x260").split("x").map(Number);
const COLS = 16;

const tmp = resolve(`.tmp-${name}`);
mkdirSync(outDir, { recursive: true });

async function loadFrames(width) {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", input,
    "-vf", `chromakey=0x00FF00:0.30:0.02,scale=${width}:-1:flags=area,format=rgba`,
    join(tmp, "f_%04d.png"),
  ]);
  const frames = [];
  for (const f of readdirSync(tmp).filter((f) => f.endsWith(".png")).sort()) {
    const { data, info } = await sharp(join(tmp, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      // hard alpha edges: pixel art has no semi-transparent pixels
      data[i + 3] = data[i + 3] >= 128 ? 255 : 0;
      // green spill on edges: only touch pixels where green clearly dominates, so Zcash yellow (r > g) is untouched
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (g > r + 20 && g > b + 20) data[i + 1] = Math.max(r, b);
    }
    frames.push({ data, w: info.width, h: info.height });
  }
  rmSync(tmp, { recursive: true, force: true });
  return frames;
}

function bbox({ data, w, h }) {
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  return { minX, maxX, minY, maxY };
}

let frames = await loadFrames(NATIVE_W);
const wantH = matchName ? JSON.parse(readFileSync(join(outDir, `${matchName}.json`), "utf8")).bodyH : targetH;
if (wantH) {
  const { minY, maxY } = bbox(frames[0]);
  const ratio = wantH / (maxY - minY);
  if (Math.abs(ratio - 1) > 0.02) frames = await loadFrames(Math.round(NATIVE_W * ratio));
}
if (mode !== "look") frames.pop(); // loops end on their start frame

// anchor = feet bottom + body center, measured on the first frame
const { w } = frames[0];
const { minY, maxY } = bbox(frames[0]);
// body center from the lower half only, so hair/cape asymmetry doesn't skew it
let sx = 0, n = 0;
const d0 = frames[0].data;
for (let y = Math.round(minY + (maxY - minY) * 0.6); y <= maxY; y++) for (let x = 0; x < w; x++) if (d0[(y * w + x) * 4 + 3]) { sx += x; n++; }
const offX = Math.round(CANVAS_W / 2 - sx / n);
const offY = CANVAS_H - 4 - maxY;
const headBottom = Math.round(minY + (maxY - minY) * 0.45);

function computeGaze() {
  // gaze = where the eyeballs sit on the head (head turn) + where the pupils sit inside them (eye turn)
  const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const isWhite = (d, i) => d[i + 3] && luma(d, i) > 215 && Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) < 40;
  const eyes = frames.map(({ data }) => {
    let wx = 0, wy = 0, wn = 0, px = 0, py = 0, pn = 0;
    for (let y = 1; y < headBottom; y++) for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (isWhite(data, i)) { wx += x; wy += y; wn++; continue; }
      if (!data[i + 3] || luma(data, i) > 70) continue;
      // a pupil pixel has white on both sides horizontally or vertically
      let l = 0, r = 0, u = 0, dn = 0;
      for (let k = 1; k <= 5; k++) {
        if (x - k >= 0 && isWhite(data, (y * w + x - k) * 4)) l = 1;
        if (x + k < w && isWhite(data, (y * w + x + k) * 4)) r = 1;
        if (y - k >= 0 && isWhite(data, ((y - k) * w + x) * 4)) u = 1;
        if (isWhite(data, ((y + k) * w + x) * 4)) dn = 1;
      }
      if ((l && r) || (u && dn)) { px += x; py += y; pn++; }
    }
    if (wn < 4) return null; // eyes hidden (cap brim, hair)
    // eyeball = whites + pupils together, so the pupil moving doesn't drag the head-turn signal the other way
    const ex = (wx + px) / (wn + pn), ey = (wy + py) / (wn + pn);
    return { white: [ex, ey], pupil: pn ? [px / pn - ex, py / pn - ey] : [0, 0] };
  });
  const { white: w0, pupil: p0 } = eyes.find(Boolean);
  const raw = eyes.map((e) => e && [
    (e.white[0] - w0[0]) + 1.5 * (e.pupil[0] - p0[0]),
    (e.white[1] - w0[1]) + 1.5 * (e.pupil[1] - p0[1]),
  ]);
  // the head moves in one continuous circle, so per-frame detection glitches are removed with a temporal median
  const median = (a) => [...a].sort((p, q) => p - q)[a.length >> 1];
  const R = 4;
  const rel = raw.map((v, i) => {
    if (!v) return null;
    const win = raw.slice(Math.max(0, i - R), i + R + 1).filter(Boolean);
    return [median(win.map((v) => v[0])), median(win.map((v) => v[1]))];
  });
  const maxMag = Math.max(...rel.filter(Boolean).map(([x, y]) => Math.hypot(x, y))) || 1;

  // The video sweeps right -> up -> left -> down -> right, so screen angle (y down) only ever decreases.
  const mag = rel.map((v) => (v ? Math.hypot(v[0], v[1]) / maxMag : 0));
  // Low-magnitude samples inside the sweep are frames where hair hides the eyes; they get interpolated instead.
  const confident = mag.map((m) => m > 0.42);
  if (process.env.DEBUG) rel.forEach((v, i) => console.log(i, mag[i].toFixed(2), v && Math.round(Math.atan2(v[1], v[0]) * 180 / Math.PI)));
  const first = confident.indexOf(true), last = confident.lastIndexOf(true);
  const angle = new Array(rel.length).fill(null);
  let prevA = null;
  for (let i = first; i <= last; i++) {
    if (!confident[i]) continue;
    let a = Math.atan2(rel[i][1], rel[i][0]);
    if (prevA !== null) {
      while (a > prevA + Math.PI) a -= 2 * Math.PI;
      while (a < prevA - Math.PI) a += 2 * Math.PI;
      a = Math.min(a, prevA); // never run backwards
    }
    angle[i] = prevA = a;
  }
  for (let i = first; i <= last; i++) {
    if (angle[i] !== null) continue;
    let lo = i - 1; while (angle[lo] === null) lo--;
    let hi = i + 1; while (hi <= last && angle[hi] === null) hi++;
    angle[i] = hi > last ? angle[lo] : angle[lo] + (angle[hi] - angle[lo]) * (i - lo) / (hi - lo);
  }
  // Clamping leaves runs of frames at the same angle; spread each run evenly toward the next value
  // so every frame owns its own slice of the circle and the head turns frame by frame.
  for (let i = first; i <= last;) {
    let j = i;
    while (j + 1 <= last && Math.abs(angle[j + 1] - angle[i]) < 1e-3) j++;
    if (j > i) {
      const next = j + 1 <= last ? angle[j + 1] : angle[i] - (angle[i] - angle[first]) / Math.max(1, i - first) * (j - i + 1);
      for (let k = i; k <= j; k++) angle[k] = angle[i] + (next - angle[i]) * (k - i) / (j - i + 1);
    }
    i = j + 1;
  }
  // circle frames sit on the unit circle at their cleaned angle; lead-in/out frames keep a shrunken vector
  return rel.map((v, i) => {
    if (i >= first && i <= last) return [Math.cos(angle[i]), Math.sin(angle[i])];
    if (!v) return [9, 9]; // unreadable lead-in/out frame: park it where no cursor direction will pick it
    return [v[0] / maxMag, v[1] / maxMag];
  });
}

// sprite sheet
const rows = Math.ceil(frames.length / COLS);
const composites = await Promise.all(frames.map(async ({ data, w: fw, h: fh }, i) => ({
  input: await sharp(data, { raw: { width: fw, height: fh, channels: 4 } }).png().toBuffer(),
  left: (i % COLS) * CANVAS_W + offX,
  top: Math.floor(i / COLS) * CANVAS_H + offY,
})));
let sheet = await sharp({ create: { width: COLS * CANVAS_W, height: rows * CANVAS_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(composites)
  .png()
  .toBuffer();
if (colors) {
  // one palette for the whole sheet, so colors don't flicker from frame to frame
  sheet = await sharp(sheet).png({ palette: true, colours: colors, dither: 0, effort: 10 }).toBuffer();
}
await sharp(sheet).webp({ lossless: true }).toFile(join(outDir, `${name}.webp`));

const meta = { frameW: CANVAS_W, frameH: CANVAS_H, cols: COLS, count: frames.length, fps: 24, bodyH: maxY - minY };
if (mode === "look") {
  // normalized gaze vector per frame, x right / y down, magnitude <= 1
  meta.gaze = computeGaze().map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
}
writeFileSync(join(outDir, `${name}.json`), JSON.stringify(meta));
console.log(`${name} (${mode}): ${frames.length} frames, body ${meta.bodyH}px, sheet ${COLS * CANVAS_W}x${rows * CANVAS_H}`);
