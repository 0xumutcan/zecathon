# The ferryman's wallet (VPS)

A small API (`ferry.mjs`) next to a zingo-cli light wallet. The site's ferry scene talks to it through
`VITE_FERRY_API` (set in Vercel). It needs no full node: zingo-cli syncs from a public lightwalletd.

Tested assumptions to re-check on the box: `zingo-cli help value_transfers` and `zingo-cli help quicksend`
(the API calls `value_transfers` and `quicksend <address> <zatoshis> "<memo>"` non-interactively).

## 1. Box

Ubuntu 24.04, 2 vCPU. Building zingo-cli wants ~4 GB RAM; on a smaller box add swap first:

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

## 2. zingo-cli

```bash
sudo apt update && sudo apt install -y build-essential pkg-config libssl-dev protobuf-compiler git curl
curl https://sh.rustup.rs -sSf | sh -s -- -y && . ~/.cargo/env
git clone https://github.com/zingolabs/zingolib.git && cd zingolib
cargo build --release --package zingo-cli
sudo cp target/release/zingo-cli /usr/local/bin/
```

## 3. The ferryman's wallet

```bash
mkdir -p ~/ferry/wallet
zingo-cli --data-dir ~/ferry/wallet --server https://zec.rocks:443 addresses
```

The first run creates a new wallet. **Write the seed phrase down offline** (`zingo-cli --data-dir ~/ferry/wallet seed`
shows it). The unified address it prints is `FERRY_ADDRESS`. Send it a little ZEC (0.05 covers hundreds of crossings).

## 4. The API

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs
git clone https://github.com/0xumutcan/zecathon.git ~/zecathon
sudo cp ~/zecathon/server/ferry.service /etc/systemd/system/ferry.service
sudo nano /etc/systemd/system/ferry.service   # set FERRY_ADDRESS (and User, if not "ferry")
sudo systemctl daemon-reload && sudo systemctl enable --now ferry
journalctl -u ferry -f
```

## 5. HTTPS

Point a DNS `A` record for `api.zecosystem.info` at the box, then:

```bash
sudo apt install -y caddy
sudo cp ~/zecathon/server/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
curl https://api.zecosystem.info/health
```

## 6. The site

Vercel → Project → Settings → Environment Variables: `VITE_FERRY_API` = `https://api.zecosystem.info`, then redeploy.

## Safety

- Hot wallet on a public server: keep only small amounts in it.
- Each session gets change once; a failed send stays marked `sending` with its `error` in `sessions.json`
  until someone looks at it.
- `/ferry/start` is limited to 20 requests per IP per hour.
