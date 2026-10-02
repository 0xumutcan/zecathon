// The ferryman and his boat on the underground lake: chunky props on the bg canvas, like the chest.
// The boat bobs on the water; the floor story decides when the ferryman talks, when the boy climbs in
// and how far out they have sailed. Positions come back in art units so the boy can be put in the boat.
import { stage, devPerArt } from "./stage.js";
import { propPixel } from "./props.js";
import { frameRect } from "./assets.js";

const BOAT_SCALE = 5 / 3;  // the boat's pixels came out coarser; 5 screen px each at S=2
const MAN_SCALE = 5 / 3;   // same pixel size as the boat
const GUNWALE = 16;        // boat pixels from the hull bottom to the top of its side, mid-ship
const DECK = 3;            // boat pixels from the hull bottom up to where feet stand

const ease = (t) => t * t * (3 - 2 * t);

/**
 * @param spot { x, water, arch } boat center, waterline and the dark arch it sails off into (x), in room image px
 * man frames: 0 idle, 1 hand out for the fare, 2 shh, 3 punting. Drawn facing right; flipped to face the quay.
 */
export function createFerry({ room, man, boat, spot }) {
  const ferry = {
    pose: 0,
    facing: -1,   // -1 faces left: toward the quay, and the way the boat sails
    sail: 0,      // 0 moored .. 1 gone into the mist
    // filled by layout(): art-unit positions for this frame
    seat: { x: 0, y: 0 }, gunwaleY: 0, scale: 1, alpha: 1, leftX: 0,

    layout(now) {
      // sailing away into the dark arch across the lake: smaller, higher, fading into the mist
      const go = ease(ferry.sail), t = now / 1000, s = 1 - 0.55 * go;
      const base = room.toArt(spot.x, spot.water);
      const unit = (propPixel() * BOAT_SCALE) / stage.S; // art units per boat pixel at full size
      const w = boat.meta.frameW * unit * s;
      const cx = base.x + (room.toArt(spot.arch, 0).x - base.x) * go * 0.8;
      const bob = Math.sin(t * 1.6) * 1.2 * s;
      const bottom = base.y - 70 * go + bob;
      Object.assign(ferry, {
        cx, bottom, w, scale: s, unit: unit * s,
        tilt: Math.sin(t * 1.1) * 0.012,
        alpha: 1 - Math.min(1, Math.max(0, (ferry.sail - 0.5) / 0.45)), // swallowed by the mist
        leftX: cx - w / 2,
        gunwaleY: bottom - GUNWALE * unit * s,
        deckY: bottom - DECK * unit * s,
        seat: { x: cx - w * 0.08, y: bottom - DECK * unit * s }, // the boy rides in the middle, the rabbit at the bow
        manX: cx + w * 0.3,       // the ferryman poles from the stern
      });
      return ferry;
    },

    draw(now) {
      if (ferry.alpha <= 0) return;
      const t = now / 1000;
      // ferryman first, then the hull over his legs
      drawFrame(man, ferry.pose, ferry.manX, ferry.deckY, MAN_SCALE * ferry.scale, ferry.facing > 0, ferry.alpha, ferry.tilt);
      ripples(t);
      // bow (lantern) on the left, the way it sails
      drawFrame(boat, 0, ferry.cx, ferry.bottom + ferry.unit * 2, BOAT_SCALE * ferry.scale, false, ferry.alpha, ferry.tilt);
      glow(ferry.cx - ferry.w * 0.47, ferry.bottom - 30 * ferry.unit, 26 * ferry.unit, 0.35 * ferry.alpha * (0.85 + 0.15 * Math.sin(t * 7)));
    },
  };

  // little pixel ripples running out from both ends of the hull; a longer wake behind it when moving
  function ripples(t) {
    const c = stage.bctx, d = devPerArt(), p = propPixel() * stage.DPR * ferry.scale;
    const moving = ferry.sail > 0 && ferry.sail < 1 ? 1 : 0;
    c.save();
    c.fillStyle = "rgb(175, 240, 228)";
    for (let i = 0; i < 3; i++) {
      const ph = (t * (0.45 + moving * 0.5) + i / 3) % 1;
      const len = (6 + 10 * ph) * ferry.unit * (1 + moving);
      c.globalAlpha = (1 - ph) * 0.35 * ferry.alpha;
      const y = Math.round((ferry.bottom + ferry.unit * 1.5) * d + i * p * 0.8);
      const out = ph * 18 * ferry.unit * (1 + 2 * moving);
      if (!moving) c.fillRect(Math.round((ferry.leftX - out - len) * d), y, Math.round(len * d), Math.round(p));
      c.fillRect(Math.round((ferry.leftX + ferry.w + out) * d), y, Math.round(len * d), Math.round(p));
    }
    c.restore();
  }

  return ferry;
}

// one frame of a chunky sheet, bottom-center at art point (x, y), optionally mirrored and tilted
function drawFrame(sheet, i, x, y, scale, flip, alpha, tilt) {
  const c = stage.bctx, d = devPerArt(), r = frameRect(sheet.meta, i);
  const px = propPixel() * stage.DPR * scale;
  c.save();
  c.globalAlpha = alpha;
  c.imageSmoothingEnabled = false;
  c.translate(Math.round(x * d), Math.round(y * d));
  if (tilt) c.rotate(tilt);
  if (flip) c.scale(-1, 1);
  c.drawImage(sheet.img, r.sx, r.sy, r.w, r.h, Math.round((-r.w * px) / 2), Math.round(-r.h * px), Math.round(r.w * px), Math.round(r.h * px));
  c.restore();
}

function glow(x, y, radius, alpha) {
  const c = stage.bctx, d = devPerArt();
  const cx = x * d, cy = y * d, r = radius * d;
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255, 200, 90, ${alpha})`);
  g.addColorStop(1, "rgba(255, 200, 90, 0)");
  c.save();
  c.globalCompositeOperation = "lighter";
  c.fillStyle = g;
  c.fillRect(cx - r, cy - r, r * 2, r * 2);
  c.restore();
}
