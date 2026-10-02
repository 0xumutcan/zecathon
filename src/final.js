// The far shore: the boat comes out of the mist, he steps onto the quay, walks to the oracle and takes
// the exam (a lock, like a quest board). Passing it, he walks into the beam of daylight and turns into
// the Zcash Master; then the ending card. Like the floors, everything follows scroll progress.
import { stage, sectionProgress } from "./stage.js";
import { drawGlow } from "./props.js";

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const FOG = [0, 0.06];        // the mist from the lake clears
const ARRIVE = [0, 0.14];     // the boat glides in and docks
const HOP = [0.16, 0.22];     // he steps out onto the quay
const TO_ORACLE = [0.24, 0.34];
const LOCK = 0.36;            // the exam
const TO_LIGHT = [0.42, 0.52];
const RISE = [0.54, 0.63];    // lifted in the beam...
const CHANGE = 0.63;          // ...a flash, and he is the Master
const FALL = [0.66, 0.74];    // set back down
const END = 0.8;              // the ending card

export function createFinal({ section, room, quest, ferry, ch, speech, outfit, ending, rabbit }) {
  let q = 0, prevQ = 0;
  const crossed = (at) => prevQ < at && q >= at;
  const sparks = [];

  const scene = {
    room,
    get progress() { return q; },
    lockY: null,
    portal: null,
    fog: 0,      // mist over everything (0..1), see main.js
    flash: 0,    // the transformation's white-gold flash (0..1)

    pre() {
      prevQ = q;
      q = sectionProgress(section);
      scene.fog = 1 - ease(seg(q, ...FOG));
      scene.lockY = quest.done ? null : section.offsetTop + LOCK * (section.offsetHeight - innerHeight);
      if (q >= LOCK - 0.005 && !quest.done) quest.show();
      if (q < LOCK - 0.04) quest.hide();
      ending.classList.toggle("show", q >= END);
    },

    post(now, dt) {
      const floorY = room.floorY;
      ch.mode = "script";
      speech.autoTalk = false;
      ch.hole = null; ch.alpha = 1; ch.scale = 1; ch.rot = 0; ch.squash = 0; ch.clipY = null;

      // --- the boat: in from the mist on the right, then moored for good
      ferry.sail = 1 - ease(seg(q, ...ARRIVE));
      ferry.pose = 0;
      ferry.layout(now);

      const quayX = ferry.seat.x - 40;
      const oracleX = room.board.x + 70, lightX = room.chestX;
      let x, feetY = floorY, canWalk = true;
      const hop = seg(q, ...HOP);
      if (hop < 1) {
        // riding in the boat, then one hop up onto the quay
        const t = ease(hop);
        x = lerp(ferry.seat.x, quayX, t);
        feetY = lerp(ferry.seat.y, floorY, t) - Math.sin(Math.PI * hop) * 40;
        ch.scale = lerp(0.9 * ferry.scale, 1, t);
        ch.alpha = ferry.alpha;
        if (hop < 0.4) ch.clipY = ferry.gunwaleY + 2;
        canWalk = false;
      } else if (q < TO_LIGHT[0]) {
        x = lerp(quayX, oracleX, ease(seg(q, ...TO_ORACLE)));
      } else {
        x = lerp(oracleX, lightX, ease(seg(q, ...TO_LIGHT)));
      }

      // --- the change: rise in the beam, flash, come down different
      const rise = ease(seg(q, ...RISE)), fall = ease(seg(q, ...FALL));
      const lift = 34 * rise * (1 - fall);
      if (lift > 0) {
        feetY -= lift + Math.sin(now / 400) * 2 * rise * (1 - fall);
        canWalk = false;
      }
      ch.lift = floorY - feetY;
      scene.flash = Math.max(0, 1 - Math.abs(q - CHANGE) / 0.025);

      ch.pose = "look";
      ch.scriptMove(x, now, dt, canWalk);

      ch.lookAt = hop < 1 ? { x: room.board.x, y: room.board.y }
        : q < LOCK + 0.04 ? { x: room.board.x, y: room.board.y }
        : q < TO_LIGHT[1] ? { x: lightX, y: floorY - 260 }
        : q < FALL[1] ? { x: ch.x, y: -500 }  // up into the light
        : null;                               // the Master looks straight at you

      const master = q >= CHANGE;
      ch.sprites.look = master ? outfit.after : outfit.before;
      ch.sprites.walk = master ? outfit.walkAfter : outfit.walkBefore;
      if (crossed(CHANGE)) burst(ch.x, ch.head.top + 90);

      if (prevQ === 0 && q > 0) speech.hush(); // nothing said on the lake carries over
      if (crossed(HOP[0] + 0.01)) speech.say("Land! Real land!", now, 1000);
      if (crossed(TO_ORACLE[1] - 0.01)) speech.say("A glowing ball. It's looking at me.", now, 1600);
      if (crossed(TO_LIGHT[0] + 0.02)) speech.say("I think I get it now.", now, 1400);
      if (crossed(FALL[1])) speech.say("Watch me. Oh wait, you can't.", now, 2400);

      ch.update(now, dt, floorY, null);
      guide(floorY);
      for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 40 * dt; s.life -= dt * 0.9; }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
    },

    drawProps(now) {
      if (rabbitInBoat) rabbit.draw(now, room.floorY); // before the boat, so the hull hides its feet
      ferry.draw(now);
      if (!rabbitInBoat) rabbit.draw(now, room.floorY);
      // the beam brightens while he is in it; the orb brightens while the exam is open or passed
      const glow = Math.max(seg(q, TO_LIGHT[0], RISE[1]) * (1 - seg(q, FALL[0], FALL[1] + 0.1) * 0.6), 0);
      if (glow > 0) beam(glow, now);
      const orb = room.toArt(874, 830);
      drawGlow(orb.x, orb.y, 70, quest.done ? 0.45 : 0.18 + 0.12 * Math.sin(now / 500));
      for (const s of sparks) drawGlow(s.x, s.y, 5 + 9 * s.life, 0.7 * s.life);
    },
  };

  // extra light in the painted beam, from the skylight down to the floor
  function beam(k, now) {
    const c = stage.bctx, top = room.toArt(1380, 60), floor = room.toArt(1420, 1430);
    const d = stage.S * stage.DPR, w0 = 60, w1 = 150;
    const g = c.createLinearGradient(0, top.y * d, 0, floor.y * d);
    const a = 0.22 * k * (0.9 + 0.1 * Math.sin(now / 300));
    g.addColorStop(0, `rgba(255, 225, 140, ${a})`);
    g.addColorStop(1, `rgba(255, 200, 90, ${a * 1.4})`);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.fillStyle = g;
    c.beginPath();
    c.moveTo((top.x - w0) * d, top.y * d); c.lineTo((top.x + w0) * d, top.y * d);
    c.lineTo((floor.x + w1) * d, floor.y * d); c.lineTo((floor.x - w1) * d, floor.y * d);
    c.closePath(); c.fill();
    c.restore();
    drawGlow(floor.x, floor.y - 10, 160, 0.3 * k);
  }

  // the rabbit rides in at the bow, hops ashore just ahead of him and waits by the oracle to watch
  let rabbitInBoat = false;
  function guide(floorY) {
    const rb = rabbit, prevX = rb.x;
    rb.state = "script"; rb.lift = 0; rb.scale = 1; rb.alpha = 1; rb.dive = null; rb.tilt = 0; rb.hole = null;
    const bowX = ferry.leftX + ferry.w * 0.17, sitX = room.board.x - 70;
    const hop = seg(q, HOP[0] - 0.03, HOP[0] + 0.01);
    let x;
    if (hop < 1) {
      x = lerp(bowX, bowX - 50, ease(hop));
      rb.lift = (floorY - ferry.deckY) * (1 - ease(hop)) + Math.sin(Math.PI * hop) * 30;
      rb.scale = lerp(ferry.scale, 1, hop);
      rb.alpha = ferry.alpha;
    } else {
      x = lerp(bowX - 50, sitX, ease(seg(q, HOP[1], TO_ORACLE[1] - 0.02)));
    }
    rabbitInBoat = hop < 0.5;
    rb.moving = Math.abs(x - prevX) > 0.01 && rb.lift === 0;
    if (rb.moving) { rb.dist += Math.abs(x - prevX); rb.facing = Math.sign(x - prevX); }
    else rb.facing = rabbitInBoat ? -1 : Math.sign(ch.x - x) || 1;
    rb.x = x;
  }

  function burst(x, y) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, v = 60 + Math.random() * 90;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 1 });
    }
  }

  return scene;
}
