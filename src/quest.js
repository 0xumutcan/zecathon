// The quest board panel: a parchment that blocks the way until the floor's task is done.
// Progress is remembered in this browser so a reload doesn't send anyone back up.
import { checkAddress } from "./address.js";
import { shieldQuest } from "./shield.js";

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`zq:${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`zq:${k}`, JSON.stringify(v)); } catch {} },
};

const QUESTS = {
  wallet: {
    eyebrow: "Quest I · The Wallet Vault",
    title: "Get a pocket nobody can peek into",
    intro: "Down here, money needs a wallet. A shielded one keeps your balance and payments private by default. Install one, then show it to the board.",
    reward: "A golden cap is waiting in the chest.",
    body(q) {
      return `
        <ol class="steps">
          <li>
            <b>Install a shielded wallet</b>
            <div class="wallets">
              <a href="https://zodl.com" target="_blank" rel="noopener"><span>Zodl</span><small>Recommended · iOS, Android</small></a>
              <a href="https://ywallet.app" target="_blank" rel="noopener"><span>YWallet</span><small>Mobile and desktop</small></a>
              <a href="https://zingolabs.org" target="_blank" rel="noopener"><span>Zingo</span><small>Mobile and desktop</small></a>
            </div>
          </li>
          <li><b>Open Receive and copy your address.</b> The private one starts with <code>u1</code>.</li>
          <li>
            <b>Show it to the board</b>
            <form class="check">
              <input name="addr" autocomplete="off" spellcheck="false" placeholder="u1…" aria-label="Your Zcash address">
              <button type="submit">Pin it</button>
            </form>
            <p class="result" role="status"></p>
          </li>
        </ol>`;
    },
    wire(panel, done) {
      const form = panel.querySelector(".check"), result = panel.querySelector(".result");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const r = checkAddress(form.addr.value);
        result.textContent = r.message;
        result.className = `result ${r.ok ? "good" : "bad"}`;
        if (r.ok) {
          store.set("address", { address: form.addr.value.trim(), kind: r.kind });
          done();
        }
      });
    },
  },
};

QUESTS.zec = {
  eyebrow: "Quest II · The Old Mint",
  title: "Put some ZEC in your pocket",
  intro: "A wallet with nothing in it is just a nice idea. Get a little ZEC: a dollar or two is plenty for the floors below.",
  reward: "A golden tee is waiting in the chest.",
  body() {
    return `
      <ol class="steps">
        <li>
          <b>Pick a way in</b>
          <div class="wallets ways">
            <div><span>An exchange</span><small>Most big exchanges list ZEC. Buy, then withdraw to your wallet.</small></div>
            <div><span>Swap in-wallet</span><small>Zodl can swap other coins into ZEC without leaving the app.</small></div>
            <div><span>A friend</span><small>Someone who has ZEC sends a little to your u1… address.</small></div>
          </div>
        </li>
        <li>
          <b>The exchange sent it to a <code>t1…</code> address. What now?</b>
          <div class="choices" role="radiogroup">
            <button type="button" data-a="ok">Nothing, it's fine where it is</button>
            <button type="button" data-a="shield">Shield it: move it into my private balance</button>
            <button type="button" data-a="back">Send it back to the exchange</button>
          </div>
          <p class="result quiz" role="status"></p>
        </li>
        <li>
          <b>Is it in your wallet?</b>
          <p class="note">We can't see your balance. That's the whole point of shielded. So we'll take your word for it; Floor IV will prove it.</p>
          <div class="confirm">
            <button type="button" data-c="yes" disabled>It arrived</button>
            <button type="button" data-c="later" class="ghost" disabled>Not yet, I'll get it later</button>
          </div>
        </li>
      </ol>`;
  },
  wire(panel, done) {
    const result = panel.querySelector(".quiz");
    const answers = {
      ok: "Careful: on a t1… address every payment, and your whole balance, is public forever. Try again.",
      back: "No need to undo anything. The coins are yours, they're just sitting in the open. Try again.",
      shield: "Exactly. One tap on Shield in your wallet and the coins move into your private balance.",
    };
    panel.querySelectorAll(".choices button").forEach((b) => b.addEventListener("click", () => {
      const right = b.dataset.a === "shield";
      panel.querySelectorAll(".choices button").forEach((x) => x.classList.toggle("picked", x === b));
      result.textContent = answers[b.dataset.a];
      result.className = `result quiz ${right ? "good" : "bad"}`;
      panel.querySelectorAll(".confirm button").forEach((x) => { x.disabled = !right; });
    }));
    panel.querySelectorAll(".confirm button").forEach((b) => b.addEventListener("click", () => {
      store.set("funded", b.dataset.c === "yes");
      done();
    }));
  },
};

QUESTS.shield = shieldQuest;

export function createQuest(id) {
  const def = QUESTS[id];
  const el = document.createElement("div");
  el.className = "quest";
  el.dataset.lenisPrevent = ""; // let the parchment scroll on its own on short screens
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", def.title);
  el.innerHTML = `
    <div class="parchment${def.wide ? " wide" : ""}">
      <p class="eyebrow">${def.eyebrow}</p>
      <h2>${def.title}</h2>
      <p class="intro">${def.intro}</p>
      ${def.body()}
      <footer>
        <span class="reward">${def.reward}</span>
        <button class="skip" type="button">Just looking? Skip for now</button>
      </footer>
    </div>`;
  document.body.append(el);

  const quest = {
    id,
    done: !!store.get(`done:${id}`),
    open: false,
    show() { if (!quest.open) { quest.open = true; el.classList.add("show"); } },
    hide() { if (quest.open) { quest.open = false; el.classList.remove("show"); } },
  };
  const finish = (how) => {
    quest.done = true;
    store.set(`done:${id}`, how);
    el.classList.add("complete");
    setTimeout(() => quest.hide(), how === "skipped" ? 0 : 1400); // let the success line be read
  };
  def.wire(el, () => finish("done"));
  el.querySelector(".skip").addEventListener("click", () => finish("skipped"));
  return quest;
}
