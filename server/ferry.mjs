// The ferryman's wallet: a tiny HTTP API next to a zingo-cli light wallet.
//
//   POST /ferry/start  { address }  -> { code, payTo, amount, change }
//   GET  /ferry/status/:code        -> { paid, changeSent, txid? }
//
// A visitor sends the fare (FARE zatoshis or more) to the ferryman's shielded address with their code in the memo.
// A loop watches the wallet's received memos; when one carries a session's code it sends CHANGE zatoshis back
// to the address the visitor gave, once per session. Sessions live in a JSON file so a restart forgets nothing.
//
// Keep only a little ZEC in this wallet: it is a hot wallet on a public server.
import http from "node:http";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { checkAddress } from "../src/address.js";

const env = (k, d) => process.env[k] ?? d;
const PORT = Number(env("PORT", 8787));
// the wallet command; may carry leading arguments (e.g. "node mock-zingo.mjs" for a dry run)
const [ZINGO, ...ZINGO_PRE] = env("ZINGO_CLI", "zingo-cli").split(" ");
const DATA_DIR = env("WALLET_DIR", "./wallet");
const SERVER = env("LIGHTWALLETD", "https://zec.rocks:443");
const PAY_TO = env("FERRY_ADDRESS", "");           // the wallet's unified address (zingo-cli addresses)
const ORIGINS = env("ALLOWED_ORIGINS", "https://zecosystem.info").split(",").map((s) => s.trim());
const DB = env("SESSIONS_FILE", "./sessions.json");
// zatoshis: 0.0002 ZEC in, 0.0001 ZEC back. Sending the change costs the standard 0.0001 fee (ZIP 317),
// so each crossing breaks even and the funded balance is only a cushion.
const FARE = 20_000, CHANGE = 10_000;
const POLL_MS = Number(env("POLL_MS", 45_000));
const MEMO_BACK = "Change from the ferryman. Safe travels, and keep it shielded.";

if (!PAY_TO) { console.error("FERRY_ADDRESS is not set"); process.exit(1); }

// --- sessions, written atomically
let sessions = existsSync(DB) ? JSON.parse(readFileSync(DB, "utf8")) : {};
const save = () => { writeFileSync(`${DB}.tmp`, JSON.stringify(sessions, null, 2)); renameSync(`${DB}.tmp`, DB); };
const zec = (zats) => String(zats / 1e8); // 20000 -> "0.0002"
const newCode = () => "FERRY-" + randomBytes(4).toString("hex").toUpperCase();

// --- zingo-cli, one call at a time (they share a wallet directory)
// zingo-cli goes online only through the Nym mixnet, whose first hop sometimes fails to come up. When that
// happens the command never reached the network, so it is safe to try again.
const MIXNET_DOWN = /Failed to start the Nym mixnet proxy/;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let queue = Promise.resolve();
function zingo(...args) {
  const once = () => new Promise((resolve, reject) => {
    execFile(ZINGO, [...ZINGO_PRE, "--data-dir", DATA_DIR, "--server", SERVER, "--waitsync", ...args],
      { timeout: 10 * 60_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(new Error(`${args[0]}: ${stderr || stdout || err.message}`)) : resolve(stdout)));
  });
  const run = async () => {
    for (let attempt = 1; ; attempt++) {
      try { return await once(); } catch (e) {
        if (!MIXNET_DOWN.test(e.message) || attempt >= 4) throw e;
        await wait(5_000 * attempt);
      }
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
// the CLI prints status lines around its JSON; take the outermost object
const json = (out) => JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));

// --- the watch loop: find paid sessions, send their change
async function watch() {
  // unpaid sessions are watched for a day; a paid one stays until its change is out
  const open = Object.values(sessions).filter((s) => !s.changeSent && (s.paid || Date.now() - s.created < 86_400_000));
  if (!open.length) return;
  // "messages" lists the memo-bearing transfers as JSON ("value_transfers" prints plain text in zingo-cli v6)
  const { value_transfers: transfers = [] } = json(await zingo("messages"));
  for (const s of open) {
    if (!s.paid) {
      const hit = transfers.find((t) => t.kind === "received" && t.value >= FARE
        && (t.memos ?? []).some((m) => String(m).toUpperCase().includes(s.code)));
      if (!hit) continue;
      Object.assign(s, { paid: true, paidTxid: hit.txid, paidAt: Date.now() });
      save();
      console.log(`paid ${s.code} by ${hit.txid}`);
    }
    if (s.paid && !s.sending) {
      s.sending = true; save(); // never twice, even if the send below hangs or the process dies
      try {
        const out = json(await zingo("quicksend", s.address, String(CHANGE), MEMO_BACK));
        Object.assign(s, { changeSent: true, txid: out.txids?.[0] ?? null });
        console.log(`change for ${s.code}: ${s.txid}`);
      } catch (e) {
        s.error = String(e.message).slice(0, 300);
        // nothing left the wallet if the mixnet never came up: try again next round. Any other failure stays
        // "sending" so a person looks at it before anything is retried (no double change).
        if (MIXNET_DOWN.test(e.message)) s.sending = false;
        console.error(`change for ${s.code} failed`, e.message);
      }
      save();
    }
  }
}
async function loop() {
  try { await watch(); } catch (e) { console.error("watch", e.message); }
  setTimeout(loop, POLL_MS);
}

// --- a little protection: start requests per IP per hour
const hits = new Map();
const limited = (ip) => {
  const now = Date.now(), list = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now); hits.set(ip, list);
  return list.length > 20;
};

function send(res, status, body, origin) {
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (origin && ORIGINS.includes(origin)) Object.assign(headers, { "access-control-allow-origin": origin, vary: "origin" });
  res.writeHead(status, headers).end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") {
    res.writeHead(204, ORIGINS.includes(origin) ? {
      "access-control-allow-origin": origin, "access-control-allow-methods": "GET, POST",
      "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "origin",
    } : {}).end();
    return;
  }
  if (req.method === "POST" && url.pathname === "/ferry/start") {
    if (limited(ip)) return send(res, 429, { error: "slow down" }, origin);
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 2000) return send(res, 413, { error: "too big" }, origin); }
    let address;
    try { address = String(JSON.parse(body).address ?? "").trim(); } catch { return send(res, 400, { error: "bad json" }, origin); }
    const check = checkAddress(address);
    if (!check.ok) return send(res, 400, { error: check.message }, origin);
    // one open session per address and day: asking again gives the same code back
    let s = Object.values(sessions).find((x) => x.address === address && !x.changeSent && Date.now() - x.created < 86_400_000);
    if (!s) {
      s = { code: newCode(), address, created: Date.now(), paid: false, changeSent: false };
      sessions[s.code] = s; save();
    }
    return send(res, 200, { code: s.code, payTo: PAY_TO, amount: zec(FARE), change: zec(CHANGE) }, origin);
  }
  const m = url.pathname.match(/^\/ferry\/status\/(FERRY-[0-9A-F]{8})$/);
  if (req.method === "GET" && m) {
    const s = sessions[m[1]];
    if (!s) return send(res, 404, { error: "unknown code" }, origin);
    return send(res, 200, { paid: s.paid, changeSent: s.changeSent, txid: s.txid ?? null }, origin);
  }
  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true }, origin);
  send(res, 404, { error: "not found" }, origin);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`ferry on 127.0.0.1:${PORT}, paying to ${PAY_TO.slice(0, 12)}…`);
  loop();
});
