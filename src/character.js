// The clueless grey guy. Two modes:
//  free:   wanders aimlessly, follows the cursor when it moves, stares at whatever is interesting (the rabbit)
//  script: the scroll story drives his position, pose and gaze (see story.js)
import { stage, input } from "./stage.js";
import { frameRect } from "./assets.js";
import { drawIntoHole } from "./hole.js";

// tools/measure-walk.mjs: one step = ~19 frames @24fps covering ~59 art px.
// The cycle plays slower for a lazy walk; ground speed scales with it so the feet don't slide.
const WALK_RATE = 0.75;
const WALK_SPEED = 74 * WALK_RATE;
const WALK_FRAMES_PER_PX = 19 / 59;
const IDLE_AFTER = 2500; // ms without mouse movement before he loses interest in the cursor

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createCharacter(sprites) {
  const ch = {
    sprites,              // { look, walk, jump } sheets; look can be swapped for outfit variants
    mode: "free",
    x: null, facing: 1,
    lift: 0, scale: 1, alpha: 1, rot: 0, // set by the story for jumps and the fall
    pose: "look",         // "look" | "walk" | "jump"
    jumpFrame: 0,         // frame of the jump clip, scrubbed by the story
    hole: null,           // { depth, mask } while going into the burrow
    lookAt: null,         // art point he stares at (script mode, or something interesting in free mode)
    target: null, idleUntil: 0, gazeGoal: 0, nextGawk: 0,
    angle: 0, engaged: false,
    walkDist: 0,
    head: { x: 0, top: 0 }, // for the speech bubble

    attentive(now) { return input.mouse && now - input.lastMove < IDLE_AFTER; },

    update(now, dt, floorY, interest) {
      const { look, walk } = ch.sprites;
      const margin = look.meta.frameW * 0.3;
      if (stage.W < look.meta.frameW) return; // not laid out yet; placing him now would pin him to an edge
      if (ch.x === null) ch.x = stage.W * 0.3;
      if (ch.mode === "free") freeUpdate(now, dt, floorY, interest, margin);
      ch.x = Math.min(stage.W - margin, Math.max(margin, ch.x));
      ch.head.x = ch.x;
      ch.head.top = floorY - ch.lift - look.meta.bodyH * ch.scale;
    },

    draw(now, dt, floorY) {
      const { look, walk } = ch.sprites;
      if (ch.alpha <= 0 || ch.x === null) return;
      const c = stage.pctx;
      let sheet, i, flip = false;
      if (ch.pose === "jump") {
        sheet = ch.sprites.jump;
        i = Math.min(sheet.meta.count - 1, Math.max(0, Math.round(ch.jumpFrame)));
      } else if (ch.pose === "walk") {
        sheet = walk;
        i = Math.floor(ch.walkDist * WALK_FRAMES_PER_PX) % walk.meta.count;
        flip = ch.facing < 0;
      } else {
        sheet = look;
        const headY = floorY - ch.lift - look.meta.bodyH * ch.scale * 0.62;
        if (ch.lookAt) {
          const goal = Math.atan2(ch.lookAt.y - headY, ch.lookAt.x - ch.x);
          const dist = Math.hypot(ch.lookAt.x - ch.x, ch.lookAt.y - headY);
          const dead = look.meta.frameW * 0.07; // a small spot on his face makes him stare straight ahead
          if (!ch.engaged && dist > dead) { ch.engaged = true; ch.angle = goal; }
          else if (ch.engaged && dist < dead * 0.6) ch.engaged = false;
          if (ch.engaged) ch.angle += wrap(goal - ch.angle) * (1 - Math.exp(-dt * 6)); // ~6/s, frame-rate independent
        } else {
          ch.engaged = false;
        }
        i = ch.engaged ? ringFrame(look.meta, ch.angle) : 0;
      }

      // contact shadow shrinks as he leaves the ground
      if (ch.lift < 60 && !ch.hole) {
        c.fillStyle = `rgba(22, 24, 34, ${0.32 * ch.alpha * (1 - Math.max(0, ch.lift) / 60)})`;
        c.beginPath();
        c.ellipse(Math.round(ch.x), floorY + 1, (ch.pose === "walk" ? 23 : 20) * ch.scale, 3 * ch.scale, 0, 0, Math.PI * 2);
        c.fill();
      }

      const r = frameRect(sheet.meta, i);
      const sprite = (ctx) => {
        ctx.save();
        ctx.globalAlpha = ch.alpha;
        ctx.translate(Math.round(ch.x), Math.round(floorY - ch.lift));
        if (ch.rot) ctx.rotate(ch.rot);
        const sq = ch.squash || 0; // landing squash: wider and shorter, pivoting on the feet
        ctx.scale(ch.scale * (1 + sq) * (flip ? -1 : 1), ch.scale * (1 - sq));
        // frames keep the feet 4px above their bottom edge (tools/process-sprite.mjs)
        ctx.drawImage(sheet.img, r.sx, r.sy, r.w, r.h, -r.w / 2, -r.h + 4, r.w, r.h);
        ctx.restore();
      };
      if (ch.hole) drawIntoHole(c, sprite, ch.hole.depth, ch.hole.mask);
      else sprite(c);
    },
  };

  function freeUpdate(now, dt, floorY, interest, margin) {
    const { look } = ch.sprites;
    const attentive = ch.attentive(now);
    if (attentive) {
      // follow the cursor, but stop a little before reaching it
      const gap = input.mouse.x - ch.x;
      ch.target = Math.abs(gap) > look.meta.frameW * 0.6 ? input.mouse.x - Math.sign(gap) * look.meta.frameW * 0.3 : null;
    } else if (interest) {
      ch.target = null; // something shiny is here; he just stands and stares at it
    } else if (ch.target === null && now > ch.idleUntil) {
      ch.target = margin + Math.random() * (stage.W - 2 * margin); // wander somewhere, for no reason
    }

    if (ch.target !== null) {
      ch.target = Math.min(stage.W - margin, Math.max(margin, ch.target));
      const gap = ch.target - ch.x, step = WALK_SPEED * dt;
      if (Math.abs(gap) <= step) {
        ch.x = ch.target;
        ch.target = null;
        ch.idleUntil = now + 1200 + Math.random() * 2500;
      } else {
        ch.facing = Math.sign(gap);
        ch.x += ch.facing * step;
        ch.walkDist += step;
        ch.pose = "walk";
        ch.engaged = false;
        return;
      }
    }

    ch.pose = "look";
    if (attentive) ch.lookAt = input.mouse;
    else if (interest) ch.lookAt = interest;
    else {
      // gawk around at nothing in particular
      if (now > ch.nextGawk) {
        ch.gazeGoal = Math.random() < 0.25 ? null : Math.random() * Math.PI * 2;
        ch.nextGawk = now + 700 + Math.random() * 1600;
      }
      ch.lookAt = ch.gazeGoal === null ? null : {
        x: ch.x + Math.cos(ch.gazeGoal) * 200,
        y: floorY - look.meta.bodyH * 0.62 + Math.sin(ch.gazeGoal) * 200,
      };
    }
  }

  return ch;
}

function ringFrame(meta, a) {
  let best = meta.ring[0].i, bestD = Infinity;
  for (const f of meta.ring) {
    const d = Math.abs(wrap(f.a - a));
    if (d < bestD) { bestD = d; best = f.i; }
  }
  return best;
}
