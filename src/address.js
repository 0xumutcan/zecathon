// Recognizes Zcash addresses well enough to coach a beginner. Unified (u1...) and Sapling (zs1...) addresses
// carry a Bech32m / Bech32 checksum, so a typo or a half-copied address is caught right in the browser.

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32 = 1, BECH32M = 0x2bc830a3;

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

// Bech32 decoding without the 90-character limit: unified addresses are much longer than that.
export function checksumOf(addr) {
  if (addr !== addr.toLowerCase() && addr !== addr.toUpperCase()) return null; // mixed case is never valid
  const s = addr.toLowerCase();
  const sep = s.lastIndexOf("1");
  if (sep < 1 || sep + 7 > s.length) return null;
  const hrp = s.slice(0, sep);
  const data = [];
  for (const c of s.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return null;
    data.push(v);
  }
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
  return { hrp, sum: polymod([...expanded, ...data]) };
}

/** @returns {{ ok: boolean, kind: string, message: string }} */
export function checkAddress(input) {
  const a = input.trim();
  if (!a) return { ok: false, kind: "empty", message: "Paste the address from your wallet's Receive screen." };

  if (/^t[13][1-9A-HJ-NP-Za-km-z]{30,40}$/.test(a)) {
    return { ok: false, kind: "transparent", message: "That's a transparent address (t1…/t3…): anyone can see every payment to it. Your wallet also has a shielded one that starts with u1. Use that." };
  }
  if (/^tex1/i.test(a)) {
    return { ok: false, kind: "tex", message: "That's a TEX address, made for exchanges that only send in the open. Grab the u1… address from your wallet instead." };
  }

  const c = checksumOf(a);
  if (!c) return { ok: false, kind: "garbled", message: "That doesn't look like a Zcash address. Copy it again from the Receive screen." };

  if (c.hrp === "u" || c.hrp === "utest") {
    if (c.sum !== BECH32M) return { ok: false, kind: "typo", message: "Almost: it starts right, but the checksum doesn't match. A character got lost while copying. Try the copy button in your wallet." };
    if (c.hrp === "utest") return { ok: false, kind: "testnet", message: "That's a testnet address. For this quest we need a real (mainnet) wallet." };
    return { ok: true, kind: "unified", message: "That's a valid Unified Address: shielded by default. Quest complete!" };
  }
  if (c.hrp === "zs") {
    if (c.sum !== BECH32) return { ok: false, kind: "typo", message: "The checksum doesn't match. Copy it again with the wallet's copy button." };
    return { ok: true, kind: "sapling", message: "A Sapling shielded address. Older but private, so it counts. (Newer wallets give you a u1… address.)" };
  }
  return { ok: false, kind: "unknown", message: "That's a valid-looking code, but not a Zcash address. Look for the one starting with u1." };
}
