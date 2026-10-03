// One dungeon floor: drop in through a portal, walk to the quest board, get stopped until the quest is done,
// walk to the chest, open it, wear what's inside, then get pulled down through a portal to the next floor.
// A floor with a ferry ends differently: after the chest he walks to the ferryman, has to pay the fare
// (a second lock), climbs into the boat and sails off into the mist.
// Like story.js, everything is a function of scroll progress, except the quest locks, which hold the
// scroll until the task is complete.
import { stage, sectionProgress } from "./stage.js";
import { drawProp, drawGlow } from "./props.js";

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

// beats, as fractions of the floor's scroll distance
const BEATS = {
  PORTAL: [0.01, 0.09], // a golden portal opens around him and the room appears through it
  DROP: [0.08, 0.14],   // he falls the last bit onto the floor
  SQUASH: [0.14, 0.18],
  TO_BOARD: [0.18, 0.32],
  LOCK: 0.34,           // the quest panel holds the scroll here
  TO_CHEST: [0.4, 0.55],
  CHEST: [0.57, 0.8],
  WEAR: 0.78,           // the item lands on him
  EXIT: [0.86, 0.94],   // a portal opens under him and swallows him; the tunnel takes over
};
// the harbor floor: the same start, squeezed, then the ferry
const FERRY_BEATS = {
  PORTAL: [0.006, 0.055], DROP: [0.05, 0.085], SQUASH: [0.085, 0.11],
  TO_BOARD: [0.11, 0.19], LOCK: 0.2,
  TO_CHEST: [0.24, 0.32], CHEST: [0.33, 0.47], WEAR: 0.46,
  TO_FERRY: [0.5, 0.58], LOCK2: 0.6, // the ferryman wants his fare
  CLIMB: [0.64, 0.7],                // a hop into the boat
  SAIL: [0.72, 0.94],                // out over the lake and into the mist
};
const BODY = 110; // art px from his feet to the middle of his body

/**
 * @param lines   what he says: { land, board, afterQuest, chest, wear, exit, ferry?, climb? }
 * @param outfit  { before, after, walkBefore, walkAfter } sheets; later ones may arrive while you play
 * @param ferry   optional boat (ferry.js) and its conversation quest (ferryquest.js): { boat, quest }
 * @param rabbit  the golden rabbit (rabbit.js): the guide, always a few hops ahead of him
 */
export function createFloor({ section, room, quest, chest, items, itemIndex, ch, speech, outfit, lines, ferry, rabbit }) {
  const B = ferry ? FERRY_BEATS : BEATS;
  let q = 0, prevQ = 0;
  const crossed = (at) => prevQ < at && q >= at;
  const sparks = [];
  const fallY = () => stage.H * 0.58;
  // the loot's moments inside the chest beat
  const C = (f) => B.CHEST[0] + (B.CHEST[1] - B.CHEST[0]) * f;

  const floor = {
    get progress() { return q; },
    lockY: null,  // absolute scroll position the page may not pass, or null
    portal: null, // tunnel overlay for this frame (see tunnel.js), null while the room is fully open
    fog: 0,       // lake mist over everything (0..1); a ferry floor ends in it

    pre() {
      prevQ = q;
      q = sectionProgress(section);
      const full = Math.hypot(stage.W, stage.H);
      if (q < B.PORTAL[1]) {
        floor.portal = { window: { x: stage.W / 2, y: fallY() - BODY, r: full * ease(seg(q, ...B.PORTAL)) } };
      } else if (B.EXIT && q >= B.EXIT[0]) {
        const t = seg(q, ...B.EXIT);
        floor.portal = { window: { x: ch.x, y: ch.head.top + 110, r: full * (1 - ease(t)) } };
      } else {
        floor.portal = null;
      }
      floor.fog = ferry ? ease(seg(q, B.SAIL[1] - 0.04, 1)) : 0;
      const span = section.offsetHeight - innerHeight;
      floor.lockY = !quest.done ? section.offsetTop + B.LOCK * span
        : ferry && !ferry.quest.done ? section.offsetTop + B.LOCK2 * span
        : null;
      if (q >= B.LOCK - 0.005 && !quest.done) quest.show();
      if (q < B.LOCK - 0.04) quest.hide(); // scrolled back up: put the parchment away
      if (ferry) {
        if (q >= B.LOCK2 - 0.005 && quest.done && !ferry.quest.done) ferry.quest.show();
        if (q < B.LOCK2 - 0.03) ferry.quest.hide();
      }
    },

    post(now, dt) {
      const floorY = room.floorY;
      ch.mode = "script";
      speech.autoTalk = false; // on a floor only the story speaks
      ch.hole = null; ch.alpha = 1; ch.scale = 1; ch.rot = 0; ch.squash = 0; ch.clipY = null;

      // --- drop out of the tunnel into the room and land
      let feetY = floorY;
      if (q < B.DROP[1]) {
        feetY = q < B.DROP[0] ? fallY() : lerp(fallY(), floorY, seg(q, ...B.DROP) ** 2);
        ch.rot = Math.sin(now / 260) * 0.22 * (1 - seg(q, ...B.DROP));
      }
      ch.squash = 0.22 * Math.sin(Math.PI * seg(q, ...B.SQUASH));

      // --- walk: center -> quest board -> chest (-> the ferryman)
      const boardX = room.board.x + 12, chestStandX = room.chestX - 112;
      let x = q < B.TO_CHEST[0] ? lerp(stage.W / 2, boardX, ease(seg(q, ...B.TO_BOARD))) : lerp(boardX, chestStandX, ease(seg(q, ...B.TO_CHEST)));
      let canWalk = q > B.DROP[1];

      // --- leave: pulled into the portal under him, drifting to the middle of the screen and tumbling
      const exit = B.EXIT ? ease(seg(q, ...B.EXIT)) : 0;
      if (exit > 0) {
        x = lerp(chestStandX, stage.W / 2, exit);
        feetY = lerp(floorY, fallY(), exit);
        ch.rot = Math.sin(now / 260) * 0.22 * exit;
        canWalk = false;
      }

      // --- or leave by boat
      let boat = null;
      if (ferry) {
        boat = ferry.boat;
        boat.sail = ease(seg(q, ...B.SAIL));
        boat.layout(now);
        const talkX = boat.manX - 92; // on the quay, facing the ferryman at the stern
        if (q >= B.TO_FERRY[0]) x = lerp(chestStandX, talkX, ease(seg(q, ...B.TO_FERRY)));
        const climb = seg(q, ...B.CLIMB);
        if (climb > 0) {
          // a hop up and over the side into the boat; he sits a little farther back, so a little smaller
          const t = ease(climb);
          x = lerp(talkX, boat.seat.x, t);
          feetY = lerp(floorY, boat.seat.y, t) - Math.sin(Math.PI * climb) * 46;
          ch.scale = lerp(1, 0.9, t) * (climb >= 1 ? boat.scale : 1);
          if (climb >= 1) { x = boat.seat.x; feetY = boat.seat.y; }
          if (climb > 0.6) ch.clipY = boat.gunwaleY + 2; // behind the hull from here on: only above the side shows
          canWalk = false;
        }
        ch.alpha = boat.alpha;
        // the ferryman faces the boy, then poles them out toward the arch
        boat.pose = q >= B.SAIL[0] && q < B.SAIL[1] ? (Math.floor(now / 700) % 2 ? 3 : 0)
          : ferry.quest.open ? ferry.quest.pose : 0;
      }
      ch.lift = floorY - feetY;

      ch.pose = "look";
      ch.scriptMove(x, now, dt, canWalk);
      if (boat && q >= B.SAIL[0]) ch.facing = -1;

      // --- what he stares at
      const chestTop = floorY - 40;
      ch.lookAt = q < B.DROP[1] || exit > 0 ? { x: ch.x, y: -500 }
        : q < B.TO_BOARD[1] + 0.06 ? { x: room.board.x, y: room.board.y }
        : q < B.CHEST[0] ? { x: room.chestX, y: chestTop }
        : q < B.WEAR ? itemPos(floorY)
        : boat && q < B.SAIL[0] ? { x: boat.manX, y: boat.deckY - 150 }
        : boat ? { x: -stage.W, y: boat.seat.y - 160 } // ahead, into the dark
        : null;

      // --- the reward: wear it once it lands on him (and take it off again when scrolling back)
      const worn = q >= B.WEAR;
      ch.sprites.look = worn ? outfit.after : outfit.before;
      ch.sprites.walk = worn ? outfit.walkAfter : outfit.walkBefore;
      if (crossed(B.WEAR)) burst(ch.x, ch.head.top + 10);

      if (crossed(B.SQUASH[0] + 0.01)) speech.say(lines.land, now, 900);
      if (crossed(B.TO_BOARD[1] - 0.01)) speech.say(lines.board, now, 1600);
      if (crossed(B.TO_CHEST[0] + 0.02)) speech.say(lines.afterQuest, now, 1400);
      if (crossed(B.CHEST[0])) speech.say(lines.chest, now, 1000);
      if (crossed(B.WEAR + 0.01)) speech.say(lines.wear, now, 1800);
      if (B.EXIT && crossed(B.EXIT[0] + 0.005)) speech.say(lines.exit, now, 1000);
      if (ferry) {
        if (crossed(B.TO_FERRY[1] - 0.01)) speech.say(lines.ferry, now, 1400);
        if (crossed(B.CLIMB[0] + 0.01)) speech.say(lines.climb, now, 1200);
        if (crossed(B.SAIL[0] + 0.03)) speech.say(lines.sail, now, 1800);
      }

      if (lines.rabbit && crossed(B.SQUASH[1] + 0.005)) speech.say(lines.rabbit, now, 1400);
      if (q > B.SQUASH[0] && q < B.TO_BOARD[0]) ch.lookAt = rabbit.headPoint(floorY); // he spots the rabbit first

      ch.update(now, dt, floorY, null);
      guide(now, floorY);
      updateSparks(dt);
    },

    // chest, loot, the boat and sparkles on the bg canvas
    drawProps(now) {
      const floorY = room.floorY, c = seg(q, ...B.CHEST);
      if (rabbitInBoat) rabbit.draw(now, floorY); // before the boat, so the hull hides its feet
      if (ferry) ferry.boat.draw(now);
      const frame = c < 0.15 ? 0 : c < 0.4 ? 1 : c < 0.65 ? 2 : 3;
      if (frame >= 1) drawGlow(room.chestX, floorY - 30, 90, frame === 2 ? 0.55 : 0.25);
      drawProp(chest, frame, room.chestX, floorY + 2);
      if (q > C(0.217) && q < B.WEAR) {
        const p = itemPos(floorY);
        drawGlow(p.x, p.y - 10, 50, 0.35);
        // loot icons are drawn on a coarser grid; 4/3 keeps their pixels an exact multiple of a screen pixel at S=2
        if (items) drawProp(items, itemIndex, p.x, p.y, { scale: 4 / 3 });
      }
      if (!rabbitInBoat) rabbit.draw(now, floorY);
      for (const s of sparks) drawGlow(s.x, s.y, 6 + 8 * s.life, 0.6 * s.life);
    },
  };

  // --- the rabbit: waits where he lands, then hops ahead of him to the board, the chest and the way out.
  // Like everything else it follows scroll progress; hops come from distance, so they rewind too.
  let rabbitInBoat = false;
  function guide(now, floorY) {
    const rb = rabbit, W = stage.W;
    const prevX = rb.x;
    rb.state = "script"; rb.lift = 0; rb.scale = 1; rb.alpha = 1; rb.dive = null; rb.tilt = 0; rb.hole = null;
    rabbitInBoat = false;
    const leg = (from, to, a, b) => lerp(from, to, ease(seg(q, a, b)));
    const waitX = W / 2 + 84, boardX = room.board.x - 64, chestX = room.chestX + 120;
    let x = leg(waitX, boardX, B.TO_BOARD[0] - 0.02, B.TO_BOARD[1] - 0.03);
    if (q >= B.TO_CHEST[0] - 0.01) x = leg(boardX, chestX, B.TO_CHEST[0] - 0.01, B.TO_CHEST[1] - 0.02);

    if (B.EXIT) {
      // the way down: it hops to the middle and dives into the floor just before the portal takes him
      const outX = W / 2 + 40;
      if (q >= B.CHEST[1]) x = leg(chestX, outX, B.CHEST[1], B.EXIT[0] - 0.02);
      const dive = seg(q, B.EXIT[0] - 0.02, B.EXIT[0] + 0.03);
      if (dive > 0) {
        rb.dive = dive < 0.3 ? 0 : dive < 0.55 ? 1 : 2;
        rb.tilt = dive < 0.3 ? -0.15 : dive < 0.55 ? 0.25 : 0;
        rb.lift = Math.sin(Math.PI * Math.min(1, dive / 0.6)) * 34 - 70 * seg(dive, 0.55, 1);
        rb.alpha = 1 - seg(dive, 0.6, 1);
      }
    } else if (ferry) {
      // the way across: it hops to the bow and in, then rides up front
      const boat = ferry.boat, bowX = () => boat.leftX + boat.w * 0.28;
      if (q >= B.TO_FERRY[0]) x = leg(chestX, bowX(), B.TO_FERRY[0], B.TO_FERRY[1] - 0.02);
      const hop = seg(q, B.CLIMB[0] - 0.04, B.CLIMB[0]);
      if (hop > 0) {
        x = bowX();
        rb.lift = (floorY - boat.deckY) * ease(hop) + Math.sin(Math.PI * hop) * 30;
        rb.scale = lerp(1, boat.scale, hop);
        rb.alpha = boat.alpha;
        rabbitInBoat = hop > 0.5;
      }
    }
    rb.moving = Math.abs(x - prevX) > 0.01 && rb.lift === 0;
    if (rb.moving) { rb.dist += Math.abs(x - prevX); rb.facing = Math.sign(x - prevX); }
    else if (!rabbitInBoat && rb.dive === null) rb.facing = Math.sign(ch.x - x) || 1; // sitting: looks back at him
    if (rabbitInBoat || (ferry && q >= B.SAIL[0])) rb.facing = -1;                       // riding: looks ahead
    rb.x = x;
  }

  // the item: rises out of the chest, hangs a moment, then arcs onto him
  function itemPos(floorY) {
    const rise = ease(seg(q, C(0.217), C(0.522))), fly = ease(seg(q, C(0.609), B.WEAR));
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
