# The ferryman's wallet (VPS)

A small API (`ferry.mjs`) next to a zingo-cli light wallet. The site's ferry scene talks to it through
`VITE_FERRY_API` (set in Vercel). It needs no full node: zingo-cli syncs from a public lightwalletd (zec.rocks).

The API calls `zingo-cli value_transfers` and `zingo-cli quicksend <address> <zatoshis> "<memo>"` non-interactively.

Live box (2026-10): Ubuntu 24.04, 1 vCPU / 2 GB, SSH alias `zecosystem-ferry` (user `ubuntu`, key-only).
It runs nothing else on purpose: it holds a hot wallet and faces the internet.

## 1. Box

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
```

## 2. zingo-cli (no prebuilt binaries; ~1 h on one core)

```bash
sudo apt-get install -y build-essential pkg-config libssl-dev protobuf-compiler git curl cmake clang
curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal && . ~/.cargo/env
git clone --depth 1 --branch zingolib_v6.0.0 https://github.com/zingolabs/zingolib.git && cd zingolib
nice -n 10 cargo build --release --package zingo-cli -j 1
sudo cp target/release/zingo-cli /usr/local/bin/
```

zingo-cli v6 only goes online through the Nym mixnet, so it also needs `nym-proxy` on the PATH (~25 min):

```bash
CARGO_BUILD_JOBS=1 nice -n 10 cargo run -q --manifest-path tools/workbench/Cargo.toml --bin bundle-nym-proxy -- --release
sudo cp target/release/nym-proxy /usr/local/bin/
```

The mixnet's first hop sometimes fails to come up ("no proven exit"); the API retries those calls.

## 3. App files and user

The repo is private, so the three files are copied over:

```bash
sudo apt-get install -y nodejs caddy
sudo adduser --system --group --home /home/ferry --shell /usr/sbin/nologin ferry
sudo mkdir -p /home/ferry/app/server /home/ferry/app/src /home/ferry/data/wallet
# from a checkout:  scp server/ferry.mjs src/address.js zecosystem-ferry:/tmp/   (+ a package.json with "type": "module")
sudo chown -R ferry:ferry /home/ferry && sudo chmod 750 /home/ferry
```

## 4. The ferryman's wallet

```bash
sudo -u ferry zingo-cli --data-dir /home/ferry/data/wallet --server https://zec.rocks:443 addresses
```

The first run creates a new wallet; its unified address is `FERRY_ADDRESS`. **The owner** reads the seed phrase
on the box and writes it down offline (`sudo -u ferry zingo-cli --data-dir /home/ferry/data/wallet seed`).
Fund it with a little ZEC (0.05 covers hundreds of crossings).

## 5. Service and HTTPS

```bash
sudo cp ferry.service /etc/systemd/system/   # set FERRY_ADDRESS first
sudo systemctl daemon-reload && sudo systemctl enable --now ferry
printf "api.zecosystem.info {\n\treverse_proxy 127.0.0.1:8787\n}\n" | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl https://api.zecosystem.info/health
```

DNS: `A api → <box IP>` at Namecheap.

## 6. The site

Vercel → Project → Settings → Environment Variables: `VITE_FERRY_API` = `https://api.zecosystem.info`, then redeploy.

## Safety

- Hot wallet on a public server: keep only small amounts in it.
- Each session gets change once; a failed send stays marked `sending` with its `error` in `sessions.json`
  until someone looks at it.
- `/ferry/start` is limited to 20 requests per IP per hour.
- The service runs as `ferry` with a read-only filesystem except `/home/ferry/data`.
