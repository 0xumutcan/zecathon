// Pixel speech bubble over his head: random clueless thoughts every 5-10s, reactions to the cursor,
// and lines the story asks for at key moments.
import { stage } from "./stage.js";

const THOUGHTS = [
  "I'm lost...",
  "What even is a Zcash?",
  "I don't know anything about this ecosystem.",
  "I need to learn. Can you help me?",
  "Is a wallet... like a pocket?",
  "Someone said \"shielded\". Shielded from what?",
  "Wait. Everyone can see my payments?",
  "Where am I going? No idea.",
  "Privacy sounds important. I think.",
  "ZEC? Is that a sneeze?",
  "Hello? Anybody?",
  "Maybe if I follow that arrow I'll figure it out.",
];
const REACTIONS = [
  "Oh! Are you going to help me?",
  "Wait for me!",
  "Where are we going?",
  "You look like you know things.",
];

export function createSpeech(el) {
  const sp = {
    text: "", typed: -1, start: 0, until: 0, last: null,
    next: performance.now() + 2500,
    wasAttentive: false,
    autoTalk: true, // the story turns random thoughts off while it is talking

    say(text, now, hold = 2600) {
      sp.text = text; sp.last = text; sp.typed = -1; sp.start = now;
      sp.until = now + 600 + text.length * 45 + hold; // type it, then let it sit long enough to read
      el.classList.add("show");
    },
    later(text, at, hold) { sp.queue.push({ text, at, hold }); },
    hush() { sp.until = 0; sp.queue.length = 0; },
    queue: [],

    update(now, head, attentive) {
      if (sp.queue.length && now >= sp.queue[0].at) { const q = sp.queue.shift(); sp.say(q.text, now, q.hold); }
      const speaking = now < sp.until;
      if (sp.autoTalk) {
        // the cursor waking up after a quiet spell gets a reaction (most of the time)
        if (attentive && !sp.wasAttentive && !speaking && Math.random() < 0.6) sp.say(pick(REACTIONS, sp.last), now);
        else if (!speaking && now > sp.next) sp.say(pick(THOUGHTS, sp.last), now);
      }
      sp.wasAttentive = attentive;

      if (now >= sp.until) {
        if (el.classList.contains("show")) {
          el.classList.remove("show");
          sp.next = now + 5000 + Math.random() * 5000;
        }
        return;
      }
      // typewriter; the untyped rest stays in the layout (hidden) so the bubble doesn't grow while typing
      const n = Math.min(sp.text.length, Math.floor((now - sp.start) / 40));
      if (n !== sp.typed) {
        sp.typed = n;
        el.textContent = sp.text.slice(0, n);
        const rest = document.createElement("span");
        rest.style.visibility = "hidden";
        rest.textContent = sp.text.slice(n);
        el.append(rest);
      }
      // anchor the tail just above his head, keep the bubble on screen
      const S = stage.S, headX = head.x * S;
      const w = el.offsetWidth, h = el.offsetHeight;
      const left = Math.min(innerWidth - w - 12, Math.max(12, headX - w * 0.3));
      el.style.translate = `${Math.round(left)}px ${Math.round(head.top * S - h - S * 8)}px`;
      el.style.setProperty("--tail-x", `${Math.min(w - S * 4, Math.max(S * 4, headX - left))}px`);
    },
  };
  return sp;
}

function pick(list, last) {
  let t;
  do t = list[Math.floor(Math.random() * list.length)]; while (t === last && list.length > 1);
  return t;
}
