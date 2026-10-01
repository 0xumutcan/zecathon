import Lenis from "lenis";
import "./style.css";
import { initStage, stage } from "./stage.js";
import { loadSprite } from "./assets.js";
import { createSurface } from "./surface.js";
import { createCharacter } from "./character.js";
import { createRabbit } from "./rabbit.js";
import { createSpeech } from "./speech.js";
import { createStory } from "./story.js";

initStage();
const lenis = new Lenis({ lerp: 0.1 });

(async () => {
  const [surface, look, walk, jump, rabbitSheet, rabbitDive] = await Promise.all([
    createSurface(),
    loadSprite("character", "0_base"),
    loadSprite("character", "walk"),
    loadSprite("character", "jump"),
    loadSprite("actors", "rabbit_b", "png"),
    loadSprite("actors", "rabbit_dive", "png"),
  ]);
  const ch = createCharacter({ look, walk, jump });
  const rabbit = createRabbit(rabbitSheet, rabbitDive);
  const speech = createSpeech(document.getElementById("bubble"));
  const story = createStory({
    section: document.getElementById("surface"),
    hero: document.getElementById("hero"),
    hint: document.getElementById("hint"),
    surface, ch, rabbit, speech,
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
    surface.draw(now);
    story.post(now, dt);
    rabbit.draw(now, surface.floorY);

    stage.pctx.clearRect(0, 0, stage.W, stage.H);
    surface.drawDust(dt, now);
    ch.draw(now, dt, surface.floorY);
    speech.update(now, ch.head, ch.attentive(now));
  }
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    // test hook: jump to a story position and render frames without relying on rAF (hidden tabs throttle it)
    window.__dev = {
      at(progress, frames = 20) {
        const s = document.getElementById("surface");
        lenis.scrollTo(s.offsetTop + progress * (s.offsetHeight - innerHeight), { immediate: true });
        let t = performance.now();
        for (let i = 0; i < frames; i++) render((t += 16));
        return { p: +story.progress.toFixed(3), ch: { x: Math.round(ch.x), pose: ch.pose, lift: Math.round(ch.lift) }, rabbit: { x: Math.round(rabbit.x), state: rabbit.state } };
      },
      run(ms) { let t = performance.now(); for (let i = 0; i < ms / 16; i++) render((t += 16)); },
    };
  }
})();
