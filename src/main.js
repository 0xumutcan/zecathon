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
import { createFerry } from "./ferry.js";
import { createFerryQuest } from "./ferryquest.js";

// the dungeon, top to bottom: each floor has its room, its quest, the loot in its chest and the outfit it gives
const FLOORS = [
  {
    id: "floor1", quest: "wallet", item: 0, outfit: ["0_base", "1_cap"],
    lines: {
      land: "Ouch.", board: "A quest board? For me?", afterQuest: "I have a wallet now. I think.",
      chest: "Treasure?!", wear: "A cap! It even has a Z on it.", exit: "Wait, the floor is glowi—",
    },
  },
  {
    id: "floor2", quest: "zec", item: 1, outfit: ["1_cap", "2_tee"],
    lines: {
      land: "Oof. Again?", board: "Another quest. Of course.", afterQuest: "Coins in. Nobody watching.",
      chest: "More treasure!", wear: "A matching tee. I'm getting the hang of this.", exit: "Here we go again!",
    },
  },
  {
    id: "floor3", quest: "shield", item: 2, outfit: ["2_tee", "3_jacket"],
    lines: {
      land: "Why is it wet down here?", board: "A board about... boats?", afterQuest: "The shielded ones just... weren't there.",
      chest: "Treasure, by the water!", wear: "A jacket. I look like I know things now.",
      ferry: "Excuse me... are you the ferryman?", climb: "Wobbly!", sail: "Bye, watchers. You'll never know where I went.",
    },
    // he leaves this floor by boat instead of a portal; the boat is moored here (room image px)
    ferry: { x: 2100, water: 1385, arch: 1780 },
  },
];

initStage();
const lenis = new Lenis({ lerp: 0.1 });

(async () => {
  const [surface, rooms, look, walk, jump, rabbitSheet, rabbitDive, chest, items, ferryman, boatSheet] = await Promise.all([
    createSurface(),
    Promise.all(FLOORS.map((f) => createRoom(f.id))),
    loadSprite("character", "0_base"),
    loadSprite("character", "walk"),
    loadSprite("character", "jump"),
    loadSprite("actors", "rabbit_b", "png"),
    loadSprite("actors", "rabbit_dive", "png"),
    loadSprite("actors", "chest", "png"),
    loadSprite("actors", "items", "png"),
    loadSprite("actors", "ferryman", "png"),
    loadSprite("actors", "boat", "png"),
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

  // outfits (a look sheet and a walk sheet each) download one after another in the background while he is
  // still up top; until one arrives, the floor shows the last outfit that did
  const sheets = { "0_base": look, "walk_0_base": walk };
  (async () => {
    for (const f of FLOORS) {
      const name = f.outfit[1];
      try { sheets[name] = await loadSprite("character", name); } catch {}
      try { sheets[`walk_${name}`] = await loadSprite("character", `walk_${name}`); } catch {}
    }
  })();
  // newest outfit that has arrived, going backwards from the one asked for
  const ORDER = ["0_base", ...FLOORS.map((f) => f.outfit[1])];
  const latest = (name, prefix = "") => {
    for (let i = ORDER.indexOf(name); i >= 0; i--) if (sheets[prefix + ORDER[i]]) return sheets[prefix + ORDER[i]];
  };
  const wardrobe = ([before, after]) => ({
    get before() { return latest(before); },
    get after() { return latest(after); },
    get walkBefore() { return latest(before, "walk_"); },
    get walkAfter() { return latest(after, "walk_"); },
  });

  const floorObjs = FLOORS.map((f, i) => {
    const floor = createFloor({
      section: document.getElementById(f.id),
      room: rooms[i], quest: createQuest(f.quest), chest, items, itemIndex: f.item,
      ch, speech, outfit: wardrobe(f.outfit), lines: f.lines,
      ferry: f.ferry && {
        boat: createFerry({ room: rooms[i], man: ferryman, boat: boatSheet, spot: f.ferry }),
        quest: createFerryQuest(),
      },
    });
    floor.room = rooms[i];
    return floor;
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
    stage.scrollY = lenis.scroll;

    story.pre();
    for (const f of floorObjs) f.pre();
    // a quest holds the page: no scrolling past its board until it's done (going back up is fine)
    for (const f of floorObjs) {
      if (f.lockY !== null && lenis.scroll > f.lockY) { lenis.scrollTo(f.lockY, { immediate: true }); break; }
    }

    // the deepest chapter that has started is the one on screen
    const active = [...floorObjs].reverse().find((f) => f.progress > 0) ?? null;
    if (active) {
      active.room.draw(now);
      active.post(now, dt);
      active.drawProps(now);
    } else {
      surface.draw(now);
      story.post(now, dt);
      rabbit.draw(now, surface.floorY);
    }

    // the shielded layer between scenes: a golden tunnel, entered and left through a round portal
    const portal = active ? active.portal : story.portal;
    if (portal) tunnel.draw(now, lenis.scroll, { x: stage.W / 2, y: stage.H * 0.58 - 110 }, portal.window);

    stage.pctx.clearRect(0, 0, stage.W, stage.H);
    if (!active) surface.drawDust(dt, now);
    ch.draw(now, dt, active ? active.room.floorY : surface.floorY);
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
        return {
          surface: +story.progress.toFixed(3),
          floors: floorObjs.map((f) => +f.progress.toFixed(3)),
          ch: { x: Math.round(ch.x), pose: ch.pose, lift: Math.round(ch.lift) },
        };
      },
      run(ms) { let t = performance.now(); for (let i = 0; i < ms / 16; i++) render((t += 16)); },
      // smooth-scroll to a position like a wheel flick would, recording his pose every frame
      settle(progress, id, frames = 120) {
        const s = document.getElementById(id);
        lenis.scrollTo(s.offsetTop + progress * (s.offsetHeight - innerHeight));
        const poses = [];
        let t = performance.now();
        for (let i = 0; i < frames; i++) { render((t += 16)); poses.push(ch.pose[0]); }
        return poses.join("");
      },
      floors: floorObjs, ch,
    };
  }
})();
