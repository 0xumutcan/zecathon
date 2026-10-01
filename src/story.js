// Maps scroll progress through the surface chapter onto what happens on screen.
// Everything is a pure function of progress, so scrolling back rewinds the scene.
import { stage } from "./stage.js";

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (p, a, b) => clamp01((p - a) / (b - a));      // 0..1 inside [a, b]
const ease = (t) => t * t * (3 - 2 * t);                   // smoothstep
const lerp = (a, b, t) => a + (b - a) * t;

// beats, as fractions of the chapter's scroll distance
const FREE_UNTIL = 0.015;
const RABBIT_RUN = [FREE_UNTIL, 0.42];
const RABBIT_DIVE = [0.42, 0.5];
const WALK = [FREE_UNTIL + 0.03, 0.5];
const STARE = [0.5, 0.57];
const JUMP = [0.57, 0.78];
const IRIS = [0.78, 0.87];   // a golden portal closes onto the burrow, the tunnel takes over the screen
const TUNNEL = 0.87;         // from here he tumbles through the tunnel
// beats inside the jump clip (art/character/jump/jump.mp4, 24fps): hesitate, crouch, leap up,
// flip head-down at the top (~78), dive down out of frame
const CLIP_LEAP = 48, CLIP_DIVE = 86;

export function createStory({ section, hero, hint, surface, ch, rabbit, speech }) {
  let p = 0, prevP = 0;
  let start = null; // where both actors stood when the chase began
  const startedAt = performance.now();
  const crossed = (at) => prevP < at && p >= at; // fire lines only when scrolling forward through a beat

  const story = {
    get progress() { return p; },
    // the tunnel overlay for this frame: null, or { window } where window is the round hole showing the park
    portal: null,

    // before the background is drawn: scroll position
    pre() {
      prevP = p;
      const r = section.getBoundingClientRect();
      p = clamp01(-r.top / (r.height - innerHeight));
      hero.style.opacity = String(1 - seg(p, 0, 0.06));
      const iris = seg(p, ...IRIS);
      story.portal = iris <= 0 ? null : {
        window: { x: surface.hole.x, y: surface.hole.y, r: Math.hypot(stage.W, stage.H) * (1 - ease(iris)) },
      };
    },

    // after the background is drawn (floor and hole positions are current)
    post(now, dt) {
      const floorY = surface.floorY, hole = surface.hole;

      if (p <= FREE_UNTIL) {
        if (start) release();
        // a few seconds in, the golden rabbit hops in and waits between him and the hole
        if (rabbit.state === "hidden" && now - startedAt > 3500 && ch.x !== null) {
          rabbit.enter(Math.min(hole.x - 120, Math.max(ch.x + 110, stage.W * 0.5)), now);
          speech.later("Huh? A golden rabbit?", now + 1200);
        }
        hint.classList.toggle("show", rabbit.state === "idle");
        const interest = rabbit.state === "idle" || rabbit.state === "enter" ? rabbit.headPoint(floorY) : null;
        ch.update(now, dt, floorY, interest);
        rabbit.update(now, dt);
        return;
      }

      hint.classList.remove("show");
      if (!start) capture(now);
      speech.autoTalk = false;
      if (crossed(WALK[0])) speech.say("Hey! Wait up!", now, 1200);
      if (crossed(STARE[0] + 0.02)) speech.say("...down there?", now, 1600);
      if (crossed(TUNNEL + 0.01)) speech.say("Aaaaaah!", now, 1400);

      // --- rabbit: hops to just short of the hole, then leaps, tips over and dives head-first in
      const takeoffX = hole.x - 46;
      const run = ease(seg(p, ...RABBIT_RUN));
      const dive = seg(p, ...RABBIT_DIVE);
      if (dive > 0) {
        rabbit.moving = false;
        rabbit.x = lerp(takeoffX, hole.x, ease(dive));
        const y = lerp(floorY, hole.y + 10, dive) - Math.sin(Math.PI * Math.min(1, dive / 0.8)) * 42;
        rabbit.lift = floorY - y;
        rabbit.dive = dive < 0.3 ? 0 : dive < 0.55 ? 1 : 2;
        rabbit.tilt = dive < 0.3 ? -0.15 : dive < 0.55 ? 0.25 : 0;
        rabbit.scale = 1 - 0.3 * seg(dive, 0.55, 1);
        const depth = seg(dive, 0.6, 1);
        rabbit.hole = depth > 0 ? { depth, mask: surface.holeMask(true) } : null;
      } else {
        const newX = lerp(start.rabbitX, takeoffX, run);
        rabbit.dist += Math.abs(newX - rabbit.x);
        rabbit.moving = Math.abs(newX - rabbit.x) > 0.01;
        rabbit.x = newX;
        rabbit.lift = 0; rabbit.scale = 1; rabbit.dive = null; rabbit.tilt = 0; rabbit.hole = null;
      }
      rabbit.alpha = p >= RABBIT_DIVE[1] ? 0 : 1;

      // --- him: walk after it, stop at the edge and stare, jump in, fall
      const walkT = ease(seg(p, ...WALK));
      const approach = ease(seg(p, ...STARE)); // after the rabbit is gone he creeps up to the edge
      const jump = seg(p, ...JUMP);
      // once the portal has closed he reappears in the tunnel, tumbling in the middle of the screen
      const fallY = stage.H * 0.58;
      const fall = p >= TUNNEL ? 1 : 0;
      // he hangs back while the rabbit dives (so it isn't hidden behind him), then creeps to the edge
      let x = lerp(lerp(start.chX, hole.x - 140, walkT), hole.x - 70, approach);
      ch.lift = 0; ch.scale = 1; ch.alpha = 1; ch.rot = 0; ch.hole = null;
      if (jump > 0) {
        // scrub the jump clip; the clip handles the up/flip/down motion, we carry him over to the burrow
        const n = ch.sprites.jump.meta.count - 1;
        const f = jump * n;
        ch.jumpFrame = f;
        const air = seg(f, CLIP_LEAP, CLIP_DIVE);
        x = lerp(hole.x - 70, hole.x, ease(air));
        ch.lift = (floorY - (hole.y + 22)) * ease(air); // his "floor" rises to the mouth so the dive ends inside it
        const depth = seg(f, CLIP_DIVE + 4, n);
        ch.scale = 1 - 0.25 * depth;
        if (depth > 0) ch.hole = { depth, mask: surface.holeMask(false) };
      }
      if (jump >= 1) ch.alpha = 0; // gone down the hole while the portal closes
      if (fall > 0) {
        // tumbling through the tunnel, staring back up at where he came from
        x = stage.W / 2;
        ch.lift = floorY - fallY;
        ch.alpha = seg(p, TUNNEL, TUNNEL + 0.03);
        ch.scale = 1;
        ch.hole = null;
        ch.rot = Math.sin(now / 260) * 0.22;
      }
      const dx = x - ch.x;
      ch.pose = jump > 0 && jump < 1 && fall === 0 ? "jump"
        : Math.abs(dx) > 0.01 && jump === 0 && fall === 0 ? "walk" : "look";
      if (ch.pose === "walk") { ch.walkDist += Math.abs(dx); ch.facing = Math.sign(dx); }
      ch.x = x;
      ch.lookAt = fall > 0 ? { x: ch.x, y: -500 }
        : p >= RABBIT_DIVE[1] ? { x: hole.x, y: hole.y }
        : rabbit.headPoint(floorY);
      ch.update(now, dt, floorY, null);
    },
  };

  function capture(now) {
    if (rabbit.state === "hidden") rabbit.x = -20; // scrolled before it showed up: it bolts in from the left
    start = { chX: ch.x ?? stage.W * 0.3, rabbitX: rabbit.x };
    ch.mode = "script";
    rabbit.state = "script";
    speech.hush();
  }

  function release() {
    ch.mode = "free";
    ch.lift = 0; ch.scale = 1; ch.alpha = 1; ch.rot = 0; ch.hole = null;
    ch.x = start.chX;
    rabbit.x = start.rabbitX;
    rabbit.lift = 0; rabbit.scale = 1; rabbit.alpha = 1; rabbit.dive = null; rabbit.tilt = 0; rabbit.hole = null;
    rabbit.state = rabbit.x < 0 ? "hidden" : "idle";
    speech.autoTalk = true;
    start = null;
  }

  return story;
}
