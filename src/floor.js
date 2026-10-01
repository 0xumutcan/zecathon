// One dungeon floor: land through the ceiling, walk to the quest board, get stopped until the quest is done,
// walk to the chest, open it, and wear what's inside. Like story.js, everything is a function of scroll
// progress, except the quest lock, which holds the scroll until the task is complete.
import { stage } from "./stage.js";
import { drawProp, drawGlow } from "./props.js";

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

const DESCEND = [0, 0.1];   // camera sinks from the shaft into the room
const DROP = [0.1, 0.14];   // he falls the last bit onto the floor
const SQUASH = [0.14, 0.18];
const TO_BOARD = [0.18, 0.32];
const LOCK = 0.34;          // the quest panel holds the scroll here
const TO_CHEST = [0.4, 0.55];
const CHEST = [0.57, 0.8];
const WEAR = 0.78;          // the item lands on him

export function createFloor({ section, room, quest, chest, items, itemIndex, ch, speech, outfit, startCamY }) {
  let q = 0, prevQ = 0;
  const crossed = (at) => prevQ < at && q >= at;
  const sparks = [];

  const floor = {
    get progress() { return q; },
    camY: 0,
    lockY: null, // absolute scroll position the page may not pass, or null

    pre() {
      prevQ = q;
      const r = section.getBoundingClientRect();
      q = clamp01(-r.top / (r.height - innerHeight));
      floor.camY = lerp(startCamY(), room.restCamY(), ease(seg(q, ...DESCEND)));
      const lockAt = section.offsetTop + LOCK * (section.offsetHeight - innerHeight);
      floor.lockY = quest.done ? null : lockAt;
      if (q >= LOCK - 0.005 && !quest.done) quest.show();
      if (q < LOCK - 0.04) quest.hide(); // scrolled back up: put the parchment away
    },

    post(now, dt) {
      const floorY = room.floorY, H = stage.H;
      ch.mode = "script";
      speech.autoTalk = false; // on a floor only the story speaks
      ch.hole = null; ch.alpha = 1; ch.scale = 1; ch.rot = 0; ch.squash = 0;

      // --- fall in through the ceiling and land
      const fallY = H * 0.58;
      let feetY = floorY;
      if (q < DROP[1]) {
        feetY = q < DROP[0] ? fallY : lerp(fallY, floorY, seg(q, ...DROP) ** 2);
        ch.rot = Math.sin(now / 260) * 0.22 * (1 - seg(q, ...DROP));
      }
      ch.squash = 0.22 * Math.sin(Math.PI * seg(q, ...SQUASH));
      ch.lift = floorY - feetY;

      // --- walk: center -> quest board -> chest
      const boardX = room.board.x + 12, chestStandX = room.chestX - 74;
      const x = q < TO_CHEST[0] ? lerp(stage.W / 2, boardX, ease(seg(q, ...TO_BOARD))) : lerp(boardX, chestStandX, ease(seg(q, ...TO_CHEST)));
      const dx = x - ch.x;
      ch.pose = Math.abs(dx) > 0.01 && q > DROP[1] ? "walk" : "look";
      if (ch.pose === "walk") { ch.walkDist += Math.abs(dx); ch.facing = Math.sign(dx); }
      ch.x = x;

      // --- what he stares at
      const chestTop = floorY - 40;
      ch.lookAt = q < DROP[1] ? { x: ch.x, y: -500 }
        : q < TO_BOARD[1] + 0.06 ? { x: room.board.x, y: room.board.y }
        : q < CHEST[0] ? { x: room.chestX, y: chestTop }
        : q < WEAR ? itemPos(floorY)
        : null;

      // --- the reward: wear it once it lands on him (and take it off again when scrolling back)
      ch.sprites.look = q >= WEAR ? outfit.after : outfit.before;
      if (crossed(WEAR)) burst(ch.x, ch.head.top + 10);

      if (crossed(SQUASH[0] + 0.01)) speech.say("Ouch.", now, 900);
      if (crossed(TO_BOARD[1] - 0.01)) speech.say("A quest board? For me?", now, 1600);
      if (crossed(TO_CHEST[0] + 0.02)) speech.say("I have a wallet now. I think.", now, 1400);
      if (crossed(CHEST[0])) speech.say("Treasure?!", now, 1000);
      if (crossed(WEAR + 0.01)) speech.say("A cap! It even has a Z on it.", now, 1800);

      ch.update(now, dt, floorY, null);
      updateSparks(dt);
    },

    // chest, loot and sparkles on the bg canvas
    drawProps() {
      const floorY = room.floorY, c = seg(q, ...CHEST);
      const frame = c < 0.15 ? 0 : c < 0.4 ? 1 : c < 0.65 ? 2 : 3;
      if (frame >= 1) drawGlow(room.chestX, floorY - 30, 90, frame === 2 ? 0.55 : 0.25);
      drawProp(chest, frame, room.chestX, floorY + 2);
      if (q > CHEST[0] + 0.05 && q < WEAR) {
        const p = itemPos(floorY);
        drawGlow(p.x, p.y - 10, 50, 0.35);
        // loot icons are drawn on a coarser grid; 4/3 keeps their pixels an exact multiple of a screen pixel at S=2
        if (items) drawProp(items, itemIndex, p.x, p.y, { scale: 4 / 3 });
      }
      for (const s of sparks) drawGlow(s.x, s.y, 6 + 8 * s.life, 0.6 * s.life);
    },
  };

  // the item: rises out of the chest, hangs a moment, then arcs onto his head
  function itemPos(floorY) {
    const rise = ease(seg(q, 0.62, 0.69)), fly = ease(seg(q, 0.71, WEAR));
    const sx = room.chestX, sy = floorY - 30 - rise * 70;
    const tx = ch.x, ty = ch.head.top + 18;
    return { x: lerp(sx, tx, fly), y: lerp(sy, ty, fly) - Math.sin(Math.PI * fly) * 40 };
  }

  function burst(x, y) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      sparks.push({ x, y, vx: Math.cos(a) * (40 + Math.random() * 40), vy: Math.sin(a) * (40 + Math.random() * 40) - 20, life: 1 });
    }
  }
  function updateSparks(dt) {
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; s.life -= dt * 1.4; }
    for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
  }

  return floor;
}
