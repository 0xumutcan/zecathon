import Lenis from "lenis";
import "./style.css";
import { initStage, stage } from "./stage.js";
import { loadSprite } from "./assets.js";
import { createSurface } from "./surface.js";
import { createRoom } from "./room.js";
import { createCharacter } from "./character.js";
import { createRabbit } from "./rabbit.js";
import { createSpeech } from "./speech.js";
import { createStory } from "./story.js";
import { createFloor } from "./floor.js";
import { createQuest } from "./quest.js";
import { createTunnel } from "./tunnel.js";

initStage();
const lenis = new Lenis({ lerp: 0.1 });

(async () => {
  const [surface, room1, look, walk, jump, rabbitSheet, rabbitDive, chest, items] = await Promise.all([
    createSurface(),
    createRoom("floor1"),
    loadSprite("character", "0_base"),
    loadSprite("character", "walk"),
    loadSprite("character", "jump"),
    loadSprite("actors", "rabbit_b", "png"),
    loadSprite("actors", "rabbit_dive", "png"),
    loadSprite("actors", "chest", "png"),
    loadSprite("actors", "items", "png"),
  ]);
  const ch = createCharacter({ look, walk, jump });
  const rabbit = createRabbit(rabbitSheet, rabbitDive);
  const speech = createSpeech(document.getElementById("bubble"));
  const tunnel = createTunnel();
  const story = createStory({
    section: document.getElementById("surface"),
    hero: document.getElementById("hero"),
    hint: document.getElementById("hint"),
    surface, ch, rabbit, speech,
  });

  // the next outfit downloads in the background while he is still on the surface
  const outfit1 = { before: look, after: look };
  loadSprite("character", "1_cap").then((s) => { outfit1.after = s; });
  const floor1 = createFloor({
    section: document.getElementById("floor1"),
    room: room1, quest: createQuest("wallet"), chest, items, itemIndex: 0,
    ch, speech, outfit: outfit1,
  });
  document.body.classList.add("ready");

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    render(now);
  }
  function render(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    lenis.raf(now);

    story.pre();
    floor1.pre();
    // a quest holds the page: no scrolling past the board until it's done (going back up is fine)
    if (floor1.lockY !== null && lenis.scroll > floor1.lockY) lenis.scrollTo(floor1.lockY, { immediate: true });

    const inFloor = floor1.progress > 0;
    if (inFloor) room1.draw(now);
    else surface.draw(now);

    if (inFloor) floor1.post(now, dt);
    else story.post(now, dt);
    if (!inFloor) rabbit.draw(now, surface.floorY);
    else floor1.drawProps();

    // the shielded layer between scenes: a golden tunnel, entered and left through a round portal
    const portal = inFloor ? floor1.portal : story.portal;
    if (portal) tunnel.draw(now, lenis.scroll, { x: stage.W / 2, y: stage.H * 0.58 - 110 }, portal.window);

    stage.pctx.clearRect(0, 0, stage.W, stage.H);
    if (!inFloor) surface.drawDust(dt, now);
    ch.draw(now, dt, inFloor ? room1.floorY : surface.floorY);
    speech.update(now, ch.head, ch.attentive(now));
  }
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    // test hook: jump to a story position and render frames without relying on rAF (hidden tabs throttle it)
    window.__dev = {
      at(progress, frames = 20, id = "surface") {
        const s = document.getElementById(id);
        lenis.scrollTo(s.offsetTop + progress * (s.offsetHeight - innerHeight), { immediate: true, force: true });
        let t = performance.now();
        for (let i = 0; i < frames; i++) render((t += 16));
        return { surface: +story.progress.toFixed(3), floor1: +floor1.progress.toFixed(3), ch: { x: Math.round(ch.x), pose: ch.pose, lift: Math.round(ch.lift) }, rabbit: { x: Math.round(rabbit.x), state: rabbit.state } };
      },
      run(ms) { let t = performance.now(); for (let i = 0; i < ms / 16; i++) render((t += 16)); },
      floor1, ch,
    };
  }
})();
