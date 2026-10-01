// The grey, over-watched park: painted background, blinking camera lights, drifting fog and dust,
// and the earth under it that the camera sinks into when he follows the rabbit down the hole.
import { loadImg, loadJSON } from "./assets.js";
import { stage, devPerArt } from "./stage.js";

// hand-placed points on the source image (2752x1536), measured from public/env/surface.webp
const HOLE = { x: 2488, y: 1300, lipY: 1355 };

export async function createSurface() {
  const [meta, img, off, holeImg] = await Promise.all([
    loadJSON("env/surface.json"),
    loadImg("env/surface.webp"),
    loadImg("env/surface_off.webp"),
    loadImg("env/surface_hole.png"),
  ]);
  // every camera blinks on its own rhythm so they never pulse in sync
  for (const l of meta.lights) { l.period = 1.4 + Math.random() * 1.6; l.phase = Math.random(); }

  const fog = makeFog();
  const earth = makeEarth();
  const dust = Array.from({ length: 45 }, () => ({ x: Math.random(), y: Math.random(), v: 0.15 + Math.random() * 0.5, s: Math.random() * 6 }));
  let tf = { x: 0, y: 0, k: 1 }; // source image -> bg canvas device px

  const surface = {
    floorY: 0,                 // art y of the walkable curb
    hole: { x: 0, y: 0, lipY: 0 }, // art coords of the rabbit hole
    camY: 0,                   // how far the world has scrolled up (art units), for the descent

    toArt(x, y) {
      const d = devPerArt();
      return { x: (tf.x + x * tf.k) / d, y: (tf.y + y * tf.k) / d };
    },

    // the burrow opening's mask, placed in art units (px canvas) or device px (bg canvas)
    holeMask(device) {
      const s = device ? 1 : 1 / devPerArt(), m = meta.hole;
      return { img: holeImg, x: (tf.x + m.x * tf.k) * s, y: (tf.y + m.y * tf.k) * s, w: m.w * tf.k * s, h: m.h * tf.k * s };
    },

    draw(now) {
      const { bctx: c, bg } = stage;
      const t = now / 1000;
      const d = devPerArt();
      // cover the screen, keep the bottom (the ground) anchored and crop sky first
      const k = Math.max(bg.width / meta.w, bg.height / meta.h);
      const w = meta.w * k, h = meta.h * k;
      tf = { x: (bg.width - w) / 2, y: bg.height - h - surface.camY * d, k };

      surface.floorY = Math.round((tf.y + meta.groundY * k) / d);
      Object.assign(surface.hole, surface.toArt(HOLE.x, HOLE.y), { lipY: surface.toArt(0, HOLE.lipY).y });
      surface.earthTop = (tf.y + h) / d;

      c.clearRect(0, 0, bg.width, bg.height);
      c.drawImage(img, tf.x, tf.y, w, h);
      drawEarth(c, earth, tf.y + h, d);
      drawShaft(c, surface, d);

      drawFog(c, fog, t, tf.y + h * 0.35, h * 0.45, 10 * stage.DPR, 0.8);
      for (const l of meta.lights) {
        const p = (t / l.period + l.phase) % 1;
        const on = p < 0.55 || (p > 0.7 && p < 0.78); // long on, off, a short flick back on, off
        const cx = tf.x + l.x * k, cy = tf.y + l.y * k, r = l.r * k;
        if (!on) {
          c.drawImage(off, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2, cx - r, cy - r, r * 2, r * 2);
          continue;
        }
        const pulse = 0.75 + 0.25 * Math.sin(t * 6 + l.phase * 10); // glow breathes while on
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
        g.addColorStop(0, `rgba(255, 50, 50, ${0.35 * pulse})`);
        g.addColorStop(1, "rgba(255, 50, 50, 0)");
        c.globalCompositeOperation = "lighter";
        c.fillStyle = g;
        c.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
        c.globalCompositeOperation = "source-over";
      }
      drawFog(c, fog, t, tf.y + h * 0.62, h * 0.32, 22 * stage.DPR, 0.9); // near fog, faster for parallax
    },

    // the tunnel under the rabbit hole: slants from the hole to the middle of the screen, then drops straight down
    shaftX(depth) {
      const bend = stage.H * 0.5;
      return depth < bend ? surface.hole.x + (stage.W / 2 - surface.hole.x) * (depth / bend) : stage.W / 2;
    },

    // dust specks, one art pixel each, drawn on the pixel canvas
    drawDust(dt, now) {
      const { pctx: c, W } = stage;
      c.fillStyle = "rgba(245, 246, 250, 0.55)";
      for (const p of dust) {
        p.x += (p.v * dt * 8) / W;
        p.y += Math.sin(now / 1000 + p.s) * dt * 0.004;
        if (p.x > 1) { p.x = 0; p.y = Math.random(); }
        const y = Math.round(p.y * surface.floorY);
        if (y > 0) c.fillRect(Math.round(p.x * W), y, 1, 1);
      }
    },
  };
  return surface;
}

// fog: a horizontally tileable strip of soft blobs, built once
function makeFog() {
  const fog = document.createElement("canvas");
  fog.width = 1024; fog.height = 256;
  const f = fog.getContext("2d");
  for (let n = 0; n < 70; n++) {
    const x = Math.random() * 1024, y = 60 + Math.random() * 140, r = 40 + Math.random() * 110;
    for (const dx of [-1024, 0, 1024]) { // draw across the seam so the tile wraps cleanly
      const g = f.createRadialGradient(x + dx, y, 0, x + dx, y, r);
      g.addColorStop(0, `rgba(235, 238, 245, ${0.05 + Math.random() * 0.07})`);
      g.addColorStop(1, "rgba(235, 238, 245, 0)");
      f.fillStyle = g;
      f.fillRect(x + dx - r, y - r, r * 2, r * 2);
    }
  }
  return fog;
}

function drawFog(c, fog, t, top, height, speed, alpha) {
  const tw = fog.width * (height / fog.height);
  const shift = (t * speed) % tw;
  c.globalAlpha = alpha;
  for (let x = -shift; x < stage.bg.width; x += tw) c.drawImage(fog, x, top, tw, height);
  c.globalAlpha = 1;
}

// earth: a tileable pixel-art soil texture (art resolution), dark and getting darker with depth
function makeEarth() {
  const T = 96;
  const e = document.createElement("canvas");
  e.width = T; e.height = T;
  const c = e.getContext("2d");
  c.fillStyle = "#2a2522";
  c.fillRect(0, 0, T, T);
  const tones = ["#332c28", "#241f1c", "#3b332d", "#1d1917"];
  for (let i = 0; i < 900; i++) {
    c.fillStyle = tones[(Math.random() * tones.length) | 0];
    c.fillRect((Math.random() * T) | 0, (Math.random() * T) | 0, 1 + ((Math.random() * 2) | 0), 1);
  }
  for (let i = 0; i < 7; i++) { // pebbles
    const x = (Math.random() * (T - 6)) | 0, y = (Math.random() * (T - 4)) | 0, w = 3 + ((Math.random() * 4) | 0);
    c.fillStyle = "#4a423b"; c.fillRect(x, y, w, 2);
    c.fillStyle = "#5a5149"; c.fillRect(x + 1, y, w - 2, 1);
  }
  return e;
}

// the shaft, built from 3-art-px slices with ragged edges (stable per slice, so it doesn't shimmer)
function drawShaft(c, surface, d) {
  const STEP = 3, HALF = 74; // wide enough for him to tumble without clipping the walls
  const top = surface.earthTop;
  const bottom = stage.H + 4;
  if (top >= bottom) return;
  for (let y = Math.max(top, -STEP * 2); y < bottom; y += STEP) {
    const depth = y - top;
    const slice = Math.floor((y + surface.camY) / STEP); // world-anchored, so edges scroll with the earth
    const jag = (n) => ((Math.sin(slice * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const cx = surface.shaftX(depth);
    const l = cx - HALF - Math.floor(jag(1) * 6), r = cx + HALF + Math.floor(jag(2) * 6);
    c.fillStyle = "#4a3f37"; // lit rim
    c.fillRect(Math.round((l - 2) * d), Math.round(y * d), Math.round((r - l + 4) * d), Math.ceil(STEP * d));
    c.fillStyle = "#0b0909";
    c.fillRect(Math.round(l * d), Math.round(y * d), Math.round((r - l) * d), Math.ceil(STEP * d));
  }
}

function drawEarth(c, earth, top, d) {
  if (top >= stage.bg.height) return;
  c.imageSmoothingEnabled = false;
  const tile = earth.width * d;
  for (let y = top; y < stage.bg.height; y += tile) {
    for (let x = 0; x < stage.bg.width; x += tile) c.drawImage(earth, Math.floor(x), Math.floor(y), Math.ceil(tile), Math.ceil(tile));
  }
  c.imageSmoothingEnabled = true;
  // darker the deeper you go (the gradient's last color carries on below its end)
  const g = c.createLinearGradient(0, top, 0, top + stage.bg.height);
  g.addColorStop(0, "rgba(10, 8, 8, 0)");
  g.addColorStop(1, "rgba(10, 8, 8, 0.85)");
  c.fillStyle = g;
  c.fillRect(0, top, stage.bg.width, stage.bg.height - top);
}
