// Chunky low-res props (chest, loot) drawn on the bg canvas with hard pixels, like the rabbit.
import { stage, devPerArt } from "./stage.js";
import { frameRect } from "./assets.js";

// screen px per prop pixel: chunkier than the character, matching the rabbit
export const propPixel = () => Math.max(2, Math.round(stage.S * 1.5));

/** draws frame `i` of `sheet` with its bottom-center at art point (x, y) */
export function drawProp(sheet, i, x, y, { alpha = 1, scale = 1 } = {}) {
  const c = stage.bctx, d = devPerArt();
  const r = frameRect(sheet.meta, i);
  const px = propPixel() * stage.DPR * scale;
  c.save();
  c.globalAlpha = alpha;
  c.imageSmoothingEnabled = false;
  c.drawImage(sheet.img, r.sx, r.sy, r.w, r.h, Math.round(x * d - (r.w * px) / 2), Math.round(y * d - r.h * px), Math.round(r.w * px), Math.round(r.h * px));
  c.restore();
}

// soft golden glow, additive, centered at an art point
export function drawGlow(x, y, radius, alpha) {
  const c = stage.bctx, d = devPerArt();
  const cx = x * d, cy = y * d, r = radius * d;
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255, 205, 80, ${alpha})`);
  g.addColorStop(1, "rgba(255, 205, 80, 0)");
  c.save();
  c.globalCompositeOperation = "lighter";
  c.fillStyle = g;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);
  c.restore();
}
