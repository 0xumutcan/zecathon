// The golden rabbit: a chunky low-res sprite (4 poses: sit, crouch, air, land), drawn on the bg canvas
// with hard pixels. Hops are driven by distance travelled, so scrolling backwards plays them in reverse.
import { stage, devPerArt } from "./stage.js";
import { frameRect } from "./assets.js";
import { drawIntoHole } from "./hole.js";

const SIT = 0, CROUCH = 1, AIR = 2, LAND = 3;
const HOP_LEN = 46;    // art units per hop
const HOP_HEIGHT = 16; // art units at the top of a hop
const ENTER_SPEED = 80;
// the dive sheet came out on a finer grid (11.45 source px per pixel vs 14.35), so it is drawn smaller to match
const DIVE_SCALE = 11.45 / 14.35;

export function createRabbit(sheet, diveSheet) {
  const rb = {
    state: "hidden", // hidden | enter | idle | script
    x: -40, spotX: 0,
    dist: 0,         // distance hopped, drives the hop cycle
    moving: false,
    lift: 0, scale: 1, alpha: 1, // extra lift/scale/alpha, set by the story
    dive: null,      // null, or the dive pose to show: 0 leap, 1 tip over, 2 straight down
    tilt: 0,         // rotation while diving
    facing: 1,       // the sprites face right; -1 mirrors them
    hole: null,      // { depth, mask } while going into the burrow
    nextFidget: 0, fidgetUntil: 0,

    // screen px per rabbit pixel: chunkier than the character on purpose, an 8-bit spirit guide
    pixel() { return Math.max(2, Math.round(stage.S * 1.5)); },
    height() { return (sheet.meta.frameH * rb.pixel()) / stage.S; }, // in art units

    enter(spotX, now) {
      if (rb.state !== "hidden") return;
      rb.state = "enter"; rb.x = -20; rb.spotX = spotX; rb.nextFidget = now + 2500;
    },

    update(now, dt) {
      if (rb.state === "enter") {
        const step = ENTER_SPEED * dt;
        if (rb.spotX - rb.x <= step) { rb.x = rb.spotX; rb.state = "idle"; rb.dist = 0; }
        else { rb.x += step; rb.dist += step; }
        rb.moving = rb.state === "enter";
      } else if (rb.state === "idle") {
        rb.moving = false;
        // impatient fidget: stands up, checks the watch, sits back down
        if (now > rb.nextFidget) { rb.fidgetUntil = now + 450; rb.nextFidget = now + 2200 + Math.random() * 2000; }
      }
    },

    // where his eyes should go
    headPoint(floorY) { return { x: rb.x + 4, y: floorY - rb.lift - rb.height() * 0.7 }; },

    draw(now, floorY) {
      if (rb.state === "hidden" || rb.alpha <= 0) return;
      let frame = SIT, hopLift = 0;
      if (rb.moving) {
        const u = (rb.dist % HOP_LEN) / HOP_LEN;
        if (u < 0.15) frame = CROUCH;
        else if (u < 0.8) { frame = AIR; hopLift = Math.sin((Math.PI * (u - 0.15)) / 0.65) * HOP_HEIGHT; }
        else frame = LAND;
      } else if (now < rb.fidgetUntil) frame = LAND;

      const c = stage.bctx, d = devPerArt();
      const footX = rb.x * d, footY = (floorY - rb.lift - hopLift) * d;

      // contact shadow, smaller while airborne
      const s = 1 - Math.min(1, (rb.lift + hopLift) / 40);
      if (s > 0 && rb.alpha > 0) {
        c.fillStyle = `rgba(22, 24, 34, ${0.3 * s * rb.alpha})`;
        c.beginPath();
        c.ellipse(footX, floorY * d + d, 14 * d * s * rb.scale, 2.5 * d * s, 0, 0, Math.PI * 2);
        c.fill();
      }

      const sh = rb.dive === null ? sheet : diveSheet;
      const r = frameRect(sh.meta, rb.dive === null ? frame : rb.dive);
      const px = rb.pixel() * stage.DPR * rb.scale * (rb.dive === null ? 1 : DIVE_SCALE);
      const sprite = (ctx) => {
        ctx.save();
        ctx.globalAlpha = rb.alpha;
        ctx.imageSmoothingEnabled = false;
        // dive poses pivot around their middle; standing poses stand on their feet
        if (rb.dive === null) {
          ctx.translate(Math.round(footX), Math.round(footY));
          if (rb.facing < 0) ctx.scale(-1, 1);
          ctx.drawImage(sh.img, r.sx, r.sy, r.w, r.h, Math.round((-r.w * px) / 2), Math.round(-r.h * px), Math.round(r.w * px), Math.round(r.h * px));
        } else {
          ctx.translate(Math.round(footX), Math.round(footY - (r.h * px) / 2));
          if (rb.facing < 0) ctx.scale(-1, 1);
          ctx.rotate(rb.tilt);
          ctx.drawImage(sh.img, r.sx, r.sy, r.w, r.h, Math.round((-r.w * px) / 2), Math.round((-r.h * px) / 2), Math.round(r.w * px), Math.round(r.h * px));
        }
        ctx.restore();
      };
      if (rb.hole) drawIntoHole(c, sprite, rb.hole.depth, rb.hole.mask);
      else sprite(c);
    },
  };
  return rb;
}
