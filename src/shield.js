import "./shield.css";
// Quest III, the harbor: first see what the chain shows for the same payment sent three ways,
// then play the watcher and hunt payments on a radar. Transparent ones show up and can be sunk;
// shielded ones never show up, and a lucky shot only bounces off encrypted noise.

// example data, generated here so nothing is borrowed from anywhere. Fixed seed: same page every visit.
function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}
const rand = rng(0x2bc830a3);
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const pick = (chars, n, r = rand) => Array.from({ length: n }, () => chars[Math.floor(r() * chars.length)]).join("");
const tAddr = (r = rand) => "t1" + pick(B58, 33, r);
const hex = (n, r = rand) => pick("0123456789abcdef", n, r);
const short = (s) => `${s.slice(0, 6)}…${s.slice(-4)}`;

const YOU = tAddr(), FERRYMAN = tAddr();
const lock = (h) => `<span class="lk" aria-label="encrypted">${h}</span>`;

// the same payment (you pay the ferryman to cross the lake), as each kind of transaction
const VIEWS = {
  transparent: {
    label: "Transparent", sub: "t1 → t1", tone: "bad",
    rows: [
      ["Pool", "transparent"],
      ["From", `<span class="leak">${YOU}</span>`],
      ["To", `<span class="leak">${FERRYMAN}</span>`],
      ["Amount", `<span class="leak">0.50 ZEC</span>`],
      ["Memo", "none (can't carry one)"],
      ["Fee", "0.0001 ZEC"],
    ],
    learns: [
      "You paid the ferryman exactly 0.50 ZEC, and when.",
      "Everything your address ever received or sent, and what's left in it.",
      "The ferryman's address, and everyone else who pays him.",
    ],
  },
  shielding: {
    label: "Shielding", sub: "t1 → private", tone: "mid",
    rows: [
      ["Pool", "transparent → Orchard"],
      ["From", `<span class="leak">${YOU}</span>`],
      ["To", `${lock(short(hex(64)))} <small>your own private balance</small>`],
      ["Amount", `<span class="leak">0.50 ZEC</span>`],
      ["Memo", "encrypted"],
      ["Fee", "0.00015 ZEC"],
    ],
    learns: [
      "Your t1 address moved 0.50 ZEC into the shielded pool.",
      "Nothing about where it goes next.",
      "Tip: don't send that exact amount back out right away. A matching in and out is a clue.",
    ],
  },
  shielded: {
    label: "Shielded", sub: "private → private", tone: "good",
    rows: [
      ["Pool", "Orchard"],
      ["From", lock(short(hex(64)))],
      ["To", lock(short(hex(64)))],
      ["Amount", "hidden"],
      ["Memo", "encrypted, only the ferryman can open it"],
      ["Fee", "0.0001 ZEC"],
    ],
    learns: [
      "A shielded transaction happened, and when.",
      "Its fee.",
      "Not who. Not how much. Not the memo.",
    ],
  },
};

// --- the hunt
const N = 8;                    // grid is N x N
const FLEET = [3, 2, 2];        // ship lengths, once transparent and once shielded
const SWEEP = 3;                // radar sweep period, seconds

function placeFleet(r) {
  const taken = new Set(), ships = [];
  const key = (x, y) => `${x},${y}`;
  for (const kind of ["transparent", "shielded"]) {
    for (const len of FLEET) {
      for (let tries = 0; tries < 500; tries++) {
        const horiz = r() < 0.5;
        const x0 = Math.floor(r() * (horiz ? N - len + 1 : N)), y0 = Math.floor(r() * (horiz ? N : N - len + 1));
        const cells = Array.from({ length: len }, (_, i) => (horiz ? [x0 + i, y0] : [x0, y0 + i]));
        // keep a one-cell gap around every ship so two never touch
        const blocked = cells.some(([x, y]) => [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => taken.has(key(x + dx, y + dy)))));
        if (blocked) continue;
        cells.forEach(([x, y]) => taken.add(key(x, y)));
        ships.push({ kind, cells, hits: 0 });
        break;
      }
    }
  }
  return ships;
}

// what a sunk transparent payment gives away
function exposure(r) {
  const amount = (0.2 + r() * 4.8).toFixed(2), balance = (Number(amount) + 1 + r() * 60).toFixed(2);
  return { from: tAddr(r), to: tAddr(r), amount, balance };
}

export const shieldQuest = {
  eyebrow: "Quest III · The Harbor",
  title: "What does the chain see?",
  intro: "To cross the lake you pay the ferryman 0.50 ZEC. Every payment leaves a record on the chain, and anyone can read it. Here's that same payment, sent three ways.",
  reward: "A golden jacket is waiting in the chest.",
  wide: true,
  body() {
    const tabs = Object.entries(VIEWS).map(([k, v]) =>
      `<button type="button" role="tab" data-v="${k}" class="tone-${v.tone}"><i></i><span>${v.label}</span><small>${v.sub}</small></button>`).join("");
    return `
      <div class="page learn">
        <div class="tabs" role="tablist">${tabs}</div>
        <div class="ledger" role="tabpanel">
          <p class="cap">What the chain shows</p>
          <dl></dl>
          <div class="learns"><p class="cap">A stranger with a block explorer now knows</p><ul></ul></div>
        </div>
        <p class="foot">Shielded payments only leave scrambled fingerprints on the chain (nullifiers and note commitments). Your <code>u1</code> address is never written there.</p>
        <p class="rule"><b>The habit:</b> spend from your shielded balance, and shield anything that lands on a <code>t1</code> address before you use it.</p>
        <div class="next"><span class="left">Look at all three first.</span><button type="button" class="go" disabled>Now try to spy on them →</button></div>
      </div>
      <div class="page hunt" hidden>
        <p class="cap">Your turn to watch</p>
        <p class="intro">Someone is always watching the chain. Today it's you. Sink every transparent payment on the radar. They give themselves away; the shielded ones are out there too.</p>
        <div class="sea">
          <div class="radar">
            <div class="cols" aria-hidden="true">${"ABCDEFGH".split("").map((c) => `<span>${c}</span>`).join("")}</div>
            <div class="rows" aria-hidden="true">${Array.from({ length: N }, (_, i) => `<span>${i + 1}</span>`).join("")}</div>
            <div class="grid" role="grid" aria-label="Radar grid"></div>
          </div>
          <div class="side">
            <div class="score"><div><b class="n-sunk">0</b>/<span>${FLEET.length}</span><small>transparent exposed</small></div><div><b class="n-bounced">0</b><small>shots bounced off shielded</small></div></div>
            <ol class="log" aria-live="polite"></ol>
          </div>
        </div>
        <div class="end" hidden><p></p><button type="button" class="claim">Take me to the chest →</button></div>
      </div>`;
  },
  wire(panel, done) {
    const parchment = panel.querySelector(".parchment");
    // --- learn: three tabs, all three must be seen
    const dl = panel.querySelector(".ledger dl"), ul = panel.querySelector(".learns ul"), learns = panel.querySelector(".learns");
    const go = panel.querySelector(".go"), left = panel.querySelector(".next .left");
    const seen = new Set();
    const show = (k) => {
      const v = VIEWS[k];
      seen.add(k);
      panel.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === k)));
      dl.innerHTML = v.rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join("");
      ul.innerHTML = v.learns.map((l) => `<li>${l}</li>`).join("");
      learns.className = `learns tone-${v.tone}`;
      const rest = 3 - seen.size;
      go.disabled = rest > 0;
      left.textContent = rest > 0 ? `${rest} more to look at.` : "Seen enough?";
    };
    panel.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.v)));
    show("transparent");

    // --- hunt
    const grid = panel.querySelector(".grid"), log = panel.querySelector(".log");
    const end = panel.querySelector(".end");
    let ships, over;
    const shipAt = (x, y) => ships.find((s) => s.cells.some(([cx, cy]) => cx === x && cy === y));
    const note = (cls, html) => { log.insertAdjacentHTML("afterbegin", `<li class="${cls}">${html}</li>`); };

    function start() {
      const r = rng((Math.random() * 2 ** 32) >>> 0);
      ships = placeFleet(r);
      ships.forEach((s) => { if (s.kind === "transparent") s.leak = exposure(r); });
      over = false;
      log.innerHTML = "";
      end.hidden = true;
      panel.querySelector(".n-sunk").textContent = "0";
      panel.querySelector(".n-bounced").textContent = "0";
      grid.innerHTML = "";
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.dataset.x = x; cell.dataset.y = y;
        cell.setAttribute("aria-label", `${"ABCDEFGH"[x]}${y + 1}`);
        const ship = shipAt(x, y);
        if (ship?.kind === "transparent") {
          // transparent payments broadcast everything: the sweep catches them every time it passes
          const a = (Math.atan2(x - (N - 1) / 2, -(y - (N - 1) / 2)) + Math.PI * 2) % (Math.PI * 2);
          cell.classList.add("pinged");
          cell.style.setProperty("--d", `${(a / (Math.PI * 2)) * SWEEP}s`);
        }
        grid.append(cell);
      }
      grid.style.setProperty("--sweep", `${SWEEP}s`);
      // restart the sweep together with the blips so they stay in phase
      grid.classList.remove("on"); void grid.offsetWidth; grid.classList.add("on");
      note("sys", "Radar online. Red blips are transparent payments: the chain shouts them out.");
    }

    grid.addEventListener("click", (e) => {
      const cell = e.target.closest("button");
      if (!cell || over || cell.classList.contains("shot")) return;
      const x = +cell.dataset.x, y = +cell.dataset.y, ship = shipAt(x, y), at = `${"ABCDEFGH"[x]}${y + 1}`;
      cell.classList.add("shot");
      if (!ship) { cell.classList.add("miss"); return; }
      if (ship.kind === "shielded") {
        cell.classList.add("shield");
        const n = panel.querySelector(".n-bounced");
        n.textContent = String(+n.textContent + 1);
        note("shield", `<b>${at}</b> Bounced. Something shielded is here: <span class="lk">${short(hex(64, Math.random))}</span>. That's all you get.`);
        return;
      }
      cell.classList.add("hit");
      ship.hits++;
      if (ship.hits < ship.cells.length) { note("hit", `<b>${at}</b> Hit. Reading the payment…`); return; }
      ship.cells.forEach(([sx, sy]) => grid.children[sy * N + sx].classList.add("sunk"));
      const { from, to, amount, balance } = ship.leak;
      note("sunk", `<b>Exposed</b> <span class="leak">${short(from)}</span> paid <span class="leak">${short(to)}</span> <span class="leak">${amount} ZEC</span>. Sender still holds <span class="leak">${balance} ZEC</span>.`);
      const sunk = ships.filter((s) => s.kind === "transparent" && s.hits === s.cells.length);
      panel.querySelector(".n-sunk").textContent = String(sunk.length);
      if (sunk.length === FLEET.length) finish(sunk);
    });

    function finish(sunk) {
      over = true;
      grid.classList.add("over");
      // show where the shielded payments were the whole time
      ships.filter((s) => s.kind === "shielded").forEach((s) => s.cells.forEach(([x, y]) => grid.children[y * N + x].classList.add("reveal")));
      const total = sunk.reduce((t, s) => t + Number(s.leak.amount), 0).toFixed(2);
      end.querySelector("p").innerHTML = `You exposed <b>${sunk.length} transparent payments</b>: ${sunk.length * 2} addresses, ${total} ZEC in payments, and what the senders still hold. The <b>${FLEET.length} shielded payments</b> (gold) sat on the same radar the whole time. You read <b>nothing</b> from them.`;
      end.hidden = false;
      end.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    end.querySelector(".claim").addEventListener("click", done);

    go.addEventListener("click", () => {
      panel.querySelector(".learn").hidden = true;
      panel.querySelector(".hunt").hidden = false;
      parchment.classList.add("hunting");
      parchment.scrollTop = 0;
      start();
    });
  },
};
