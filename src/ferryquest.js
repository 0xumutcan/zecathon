import "./ferryquest.css";
import qrcode from "qrcode-generator";
import { checkAddress } from "./address.js";
import { store } from "./store.js";
import { skipHTML } from "./skip.js";

// The ferryman's crossing: a conversation at the water's edge that ends in a real payment.
// You send the fare from your shielded balance with a memo only he can read; he sends the change back.
//
// The ferryman's wallet runs on a small server (VITE_FERRY_API):
//   POST {api}/ferry/start  { address }  -> { code, payTo, amount, change }
//   GET  {api}/ferry/status/{code}       -> { paid, changeSent, txid? }
// Without it (local dev), the payment card says so and never shows an address to pay.

const API = import.meta.env.VITE_FERRY_API;
const FARE = "0.0002", CHANGE = "0.0001"; // the server sends the same amounts with each session
const BLOCK_SECONDS = 75;

// ZIP-321 payment request: wallets that scan it fill in address, amount and memo for you
const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const paymentUri = (to, amount, memo) => `zcash:${to}?amount=${amount}&memo=${b64url(memo)}`;

// conversation: each step is the ferryman's line, his pose and what you can answer
const STEPS = {
  hello: {
    pose: 0,
    say: "Crossing to the other side? Nobody crosses for free.",
    answers: [{ label: "How much?", to: "fare" }],
  },
  fare: {
    pose: 1,
    say: `The fare is ${CHANGE} ZEC. Send me ${FARE} and I'll send the rest back. Coins flow both ways on this lake.`,
    answers: [{ label: "Deal.", to: "secret" }],
  },
  secret: {
    pose: 2,
    say: "One more thing. Watchers line this lake. If they see you paid the ferryman, they know where you went. So... how will you pay?",
    answers: [
      { label: "From my shielded balance", to: "pay", right: true },
      { label: "From my t1 address", reply: "Transparent? Then the whole lake reads it: your address, mine, and the amount. Try again." },
      { label: "Whatever's quickest", reply: "Quick is how people get followed. Think about what the watchers can see." },
    ],
  },
};

export function createFerryQuest() {
  const el = document.createElement("div");
  el.className = "ferry-talk";
  el.dataset.lenisPrevent = "";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "The ferryman");
  el.innerHTML = `
    <div class="qwrap">
    <div class="box">
      <div class="who"><div class="face" aria-hidden="true"></div><span>The Ferryman</span></div>
      <div class="talk">
        <p class="line" aria-live="polite"></p>
        <div class="card" hidden></div>
        <div class="answers"></div>
      </div>
    </div>
    ${skipHTML({ label: "Skip the fare", hint: "No ZEC to spare? Ride along anyway." })}
    </div>`;
  document.body.append(el);
  const line = el.querySelector(".line"), answers = el.querySelector(".answers"), card = el.querySelector(".card");

  const quest = {
    id: "ferry",
    done: !!store.get("done:ferry"),
    open: false,
    pose: 0,
    show() {
      if (quest.open) return;
      quest.open = true; el.classList.add("show");
      if (!started) { started = true; go("hello"); }
    },
    hide() { if (quest.open) { quest.open = false; el.classList.remove("show"); } },
  };
  let started = false, typing = 0, polling = 0;

  // the ferryman's words appear letter by letter, like the boy's bubble
  function speak(text, pose = quest.pose) {
    quest.pose = pose;
    clearInterval(typing);
    let n = 0;
    line.textContent = "";
    line.dataset.full = text;
    typing = setInterval(() => {
      n += 2;
      line.textContent = text.slice(0, n);
      if (n >= text.length) clearInterval(typing);
    }, 22);
  }
  function buttons(list) {
    answers.innerHTML = "";
    for (const a of list) {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = a.label;
      if (a.ghost) b.className = "ghost";
      b.addEventListener("click", a.on);
      answers.append(b);
    }
  }

  function go(id) {
    const step = STEPS[id];
    if (!step) return ({ pay, change })[id]?.();
    card.hidden = true;
    speak(step.say, step.pose);
    buttons(step.answers.map((a) => ({
      label: a.label,
      on: () => (a.reply ? speak(a.reply, 0) : go(a.to)),
    })));
  }

  // --- send: the fare, shielded, with a memo only he can read
  async function pay() {
    speak("Good. Shielded, the chain only learns that something happened. Here's where to send it. Put the code in the memo; it's encrypted, so only I will ever read it.", 1);
    card.hidden = false;
    buttons([]);
    const mine = store.get("address");
    if (!mine) return askAddress(pay); // he needs to know where the change goes before you pay
    if (!API) {
      card.innerHTML = `<p class="offline">The ferryman's wallet isn't connected in this build, so there's no address to pay yet.</p>`;
      buttons([{ label: "Pretend I paid", on: () => change(null) }]);
      return;
    }
    card.innerHTML = `<p class="wait">The ferryman is counting his coins…</p>`;
    let session = store.get("ferry");
    try {
      if (!session) {
        const r = await fetch(`${API}/ferry/start`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ address: mine?.address ?? null }),
        });
        if (!r.ok) throw new Error(r.status);
        session = await r.json();
        store.set("ferry", session);
      }
    } catch {
      card.innerHTML = `<p class="offline">The ferryman can't be reached right now. Try again in a moment.</p>`;
      buttons([{ label: "Try again", on: pay }]);
      return;
    }
    const memo = `${session.code}`;
    const qr = qrcode(0, "M");
    qr.addData(paymentUri(session.payTo, session.amount, memo));
    qr.make();
    card.innerHTML = `
      <div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div>
      <dl>
        <dt>Send</dt><dd><b>${session.amount} ZEC</b></dd>
        <dt>To</dt><dd><code class="addr">${session.payTo}</code><button type="button" class="copy" data-v="${session.payTo}">Copy</button></dd>
        <dt>Memo</dt><dd><code>${memo}</code><button type="button" class="copy" data-v="${memo}">Copy</button></dd>
      </dl>
      <p class="how">Scan with your wallet and everything is filled in. Or open <b>Send</b>, paste the address, enter the amount and add the memo.</p>`;
    card.querySelectorAll(".copy").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.v); b.textContent = "Copied"; setTimeout(() => (b.textContent = "Copy"), 1200); } catch {}
    }));
    buttons([{ label: "I've sent it", on: () => watch(session) }]);
  }

  // waits for his server to see the payment arrive (a block is ~75s, so this takes a minute or two)
  function watch(session) {
    speak("Let me watch the water. A block takes about a minute and a quarter down here.", 0);
    buttons([]);
    const started = Date.now();
    const status = document.createElement("p");
    status.className = "wait";
    card.append(status);
    clearInterval(polling);
    const tick = async () => {
      const s = Math.round((Date.now() - started) / 1000);
      status.textContent = `Watching the water… ${s}s`;
      if (s % 10 !== 0) return;
      try {
        const r = await fetch(`${API}/ferry/status/${encodeURIComponent(session.code)}`);
        const st = r.ok ? await r.json() : null;
        if (st?.paid) { clearInterval(polling); change(st); }
      } catch {}
      if (s === BLOCK_SECONDS * 4) buttons([{ label: "Still nothing? Skip for now", ghost: true, on: () => finish("skipped") }]);
    };
    tick();
    polling = setInterval(tick, 1000);
  }

  // --- receive: he sends the change back to the address you pinned on Floor I
  function change(st) {
    card.hidden = true;
    if (!st) {
      speak(`On a real crossing, your ${CHANGE} ZEC change would now be on its way to your wallet, with a note only you can read. Receiving is that easy: nothing to do but wait.`, 0);
      buttons([{ label: "Got it", on: () => finish("skipped") }]);
      return;
    }
    speak(`Paid in full. Your change, ${CHANGE} ZEC, is on its way to your wallet with a note from me. Check it in a minute or two. That's receiving: nothing to do but wait.`, 0);
    buttons([
      { label: "It arrived!", on: () => finish("done") },
      { label: "I'll check later", ghost: true, on: () => finish("done") },
    ]);
  }

  // your address (the one pinned on Floor I), if this browser doesn't remember it
  function askAddress(then) {
    speak("Before you pay: where do I send your change? Show me your shielded address.", 1);
    card.hidden = false;
    card.innerHTML = `<form class="check"><input name="addr" autocomplete="off" spellcheck="false" placeholder="u1…" aria-label="Your Zcash address"><button type="submit">Here</button></form><p class="result" role="status"></p>`;
    card.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const r = checkAddress(e.target.addr.value);
      const out = card.querySelector(".result");
      out.textContent = r.message;
      out.className = `result ${r.ok ? "good" : "bad"}`;
      if (r.ok) { store.set("address", { address: e.target.addr.value.trim(), kind: r.kind }); then(); }
    });
    buttons([]);
  }

  function finish(how) {
    quest.done = true;
    store.set("done:ferry", how);
    clearInterval(polling);
    speak("Then climb in. Mind the water.", 0);
    buttons([]);
    setTimeout(() => quest.hide(), 1200);
  }
  el.querySelector(".skip-side").addEventListener("click", () => finish("skipped"));

  return quest;
}
