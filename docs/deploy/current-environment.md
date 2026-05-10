# Current deployment snapshot (testnet / production-aligned)

**Scope:** This file describes the **live beta stack on Base Sepolia** (chain `84532`)—URLs, contracts, operator runbooks. It does **not** describe a future Base **mainnet** deploy.

**Maintenance:** If you change the Fly relay URL, Netlify site URL, or on-chain contract addresses, update this file **and** the same values in repository root [`netlify.toml`](../../netlify.toml) (`VITE_RELAY_URL`, etc.), [`relay/fly.toml`](../../relay/fly.toml) (`app` name), and the snapshot table in [README.md](../../README.md). See [.github/README.md](../../.github/README.md) for a full checklist.

**Mainnet cutover + beta credit preservation** (same Merkle/`claim` system; how users keep credited amounts): see **[testnet-to-mainnet-roadmap.md](testnet-to-mainnet-roadmap.md)**.

Single place to see **what is live** today. **Update this file** (or replace the contract table with “see local `contracts/deployments/baseSepolia.json`”) whenever you **redeploy contracts** or change hosting URLs. For a longer **capabilities + roadmap** narrative, see [status-and-roadmap.md](../STATUS-AND-ROADMAP.md).

| Layer | Detail |
|--------|--------|
| **Web (Netlify)** | [https://direct-social.netlify.app](https://direct-social.netlify.app) — [dashboard](https://app.netlify.com/projects/direct-social) |
| **Relay (Fly.io)** | [https://morninrage-direct-relay.fly.dev](https://morninrage-direct-relay.fly.dev) — health: `GET /health` |
| **L2** | **Base Sepolia**, chain ID **84532** |
| **Public RPC (default)** | `https://sepolia.base.org` (overridable via `VITE_RPC_URL` / `BASE_SEPOLIA_RPC_URL`) |

## Base Sepolia contracts (recorded deploy)

Authoritative addresses after a deploy live in **`contracts/deployments/baseSepolia.json`** (gitignored — not in git). The table below is a **human-readable copy** for docs; if it ever disagrees with your local JSON or [Basescan](https://sepolia.basescan.org/), trust the chain + JSON.

| Contract | Address |
|----------|---------|
| **DirecTToken** (DIR) | `0xA02D4D759590ac737916F9Ba88c1AD338a514dCF` |
| **EmissionsController** | `0xD6FCCb66be9B28577a90A11D8A4b1Fd80a7e90a1` |

Genesis (from `contracts/scripts/deploy.ts`): **1B DIR** minted to deployer treasury; **10M DIR** transferred into `EmissionsController` as the MVP rewards pool for Merkle claims.

## Reward epochs (Merkle inventory, testnet)

Policy caps use **`perUserCapWei`** in [`contracts/scripts/example-epoch-policy.json`](../../contracts/scripts/example-epoch-policy.json). **`build-epoch.cjs`** scores posts with **`direct_handle`** using relay metrics, pays **pro-rata** from the epoch **pool**, then **clips** each beneficiary at the per-user cap. Beneficiary = **`payoutAddress`** else **last** entry in **`linkedWallets`** (see script).

| Epoch ID | Cap (DIR) | `registerRoot` tx | Relay `POST /v1/admin/rewards-epochs` |
|----------|-----------|-------------------|----------------------------------------|
| `m3-demo-1` | 5,000 | `0x595ef624b7a1a33cc1df78a0cc418ac7d7afe39012020fb5a6888d48f11c0fd3` | Done (legacy; body in repo `publish-body.json`) |
| `m3-demo-2` | **10,000** | `0x5368bf1d3f2899cb8fd29020d761bbfe34a6fecbda0bc3e41f51c2fea2de1fdd` | **Publish** with curl below (needs `INDEXER_SECRET`) |

Artifact: [`epochs/epoch-m3-demo-2.json`](../../epochs/epoch-m3-demo-2.json). POST body template: [`publish-body-m3-demo-2.json`](../../publish-body-m3-demo-2.json).

```bash
curl -fsS -X POST "https://morninrage-direct-relay.fly.dev/v1/admin/rewards-epochs" \
  -H "Content-Type: application/json" \
  -H "x-indexer-secret: $INDEXER_SECRET" \
  -d @publish-body-m3-demo-2.json
```

After `201`, **`GET /v1/rewards/epochs/latest`** should return **`id`: `m3-demo-2`** and eligible users see **10,000 DIR** on **Rewards** (claim still requires gasless relay setup + active root on-chain).

## Why Rewards shows “No epoch published on the relay yet”

**The web app and relay are working.** That copy appears when **`GET /v1/rewards/epochs/latest`** returns **`epoch: null`** — i.e. nothing has been written to **`rewards-epochs.json`** on the relay yet.

Shipping “fully live” payouts is **not** another engineering milestone in this repo: it is the **operator runbook** below (export → build → `registerRoot` → **publish epoch to relay**). Until step 5 runs successfully, users will never see an allocation on **Rewards**.

**Quick verify**

```bash
curl -sS "https://morninrage-direct-relay.fly.dev/v1/rewards/epochs/latest"
# {"epoch":null}  → no epoch published yet
# {"epoch":{...}} → app will show epoch + claim UI for eligible wallets
```

**Creator prerequisites (so your tree is not empty)**

- Profiles need **`linkedWallets`** (or **`payoutAddress`**) so `build-epoch.cjs` knows the on-chain **beneficiary** for each handle.
- Scoring only includes **posts/reposts** with a **`direct_handle`** and uses relay **metrics** (reactions, comments, shares) on those `eid`s. No engagement → zero allocation.

**Relay prerequisite**

- Set **`INDEXER_SECRET`** on Fly (`fly secrets set`) so you can call **`GET /v1/indexer/snapshot`** and **`POST /v1/admin/rewards-epochs`**.

**Admin API body vs epoch file**

The builder writes **`epochId`** in `epoch-*.json`; **`PublishedRewardEpoch`** on the relay expects **`id`** (same string). Map fields when posting, e.g. **`id`** = file’s **`epochId`**, **`publishedAtMs`** = milliseconds (often same as **`builtAtMs`** from the file, or `Date.now()` at publish time), plus **`root`**, **`chainId`**, **`allocations`**, optional **`registerTxHash`**.

Example `jq` to build a POST body from a registered epoch file:

```bash
jq '{id: .epochId, root, chainId, publishedAtMs: .builtAtMs, registerTxHash, allocations}' ../epochs/epoch-myepoch.json > publish-payload.json
curl -fsS -X POST "https://morninrage-direct-relay.fly.dev/v1/admin/rewards-epochs" \
  -H "Content-Type: application/json" \
  -H "x-indexer-secret: $INDEXER_SECRET" \
  -d @publish-payload.json
```

After a `201`, reload **Rewards**: eligible users (wallets in **`allocations`**) see amounts and can **`claim`** if the root is active on-chain and the pool is funded.

## Gasless Claim — one-time operator setup (fixes “Gasless claim is off” in the web app)

**End users never open Fly.** Only you (operator) configure this once per environment.

1. **Check relay:**

   ```bash
   curl -sS "https://morninrage-direct-relay.fly.dev/health"
   ```

   - `"sponsoredClaim": true` → gasless Claim is **ready**.
   - `"sponsoredClaim": false` → Fly secrets are missing or invalid → users always see the error until this is fixed.

2. **Set secrets** (replace values; use the same **EmissionsController** address as in Netlify `VITE_EMISSIONS_ADDRESS`):

   ```bash
   fly secrets set RELAYER_PRIVATE_KEY=0xYOUR_64_HEX_PRIVATE_KEY EMISSIONS_ADDRESS=0xYOUR_EMISSIONS_CONTROLLER -a morninrage-direct-relay
   ```

   - `RELAYER_PRIVATE_KEY` must be **`0x` + exactly 64 hex characters** (32-byte key).
   - `EMISSIONS_ADDRESS` must be **`0x` + 40 hex characters** (contract address above must match your live deployment / Netlify).

3. **Fund the relayer with Base Sepolia ETH** (gas for `claim` txs). Same CDP flow as deploy:

   - **Easiest on testnet:** use the **same** private key for Fly `RELAYER_PRIVATE_KEY` as `DEPLOYER_PRIVATE_KEY`. Then `npm run ensure:gas --prefix contracts` (CDP) tops up **one** address for deploy + gasless claims.
   - **If relayer is a different key:** add `RELAYER_PRIVATE_KEY` to **`contracts/.env`** (never commit), run `npm run ensure:gas --prefix contracts` again — the script will CDP-fund the relayer address too when it is below `OPERATOR_MIN_ETH`.

4. **Redeploy if needed** — after `fly secrets set`, Fly restarts machines. Run `fly deploy -a morninrage-direct-relay` if `/health` still shows `sponsoredClaim: false`.

5. **Netlify** — production build must include `VITE_EMISSIONS_ADDRESS` (and token) pointing at the **same** contracts. Redeploy the site after changing env vars.

**Order of confusion to avoid:** `sponsoredClaim: false` is **only** about missing/malformed Fly secrets — not about users, not about “epoch broken.” Fix secrets + fund relayer first; then Claim works for everyone signed in.

**Step-by-step (including “who runs what” for users vs operators):** [first-epoch-cookbook.md](first-epoch-cookbook.md)

## Automation (`contracts/`)

| Script | Purpose |
|--------|---------|
| `npm run gen:deployer` | Writes `DEPLOYER_PRIVATE_KEY` to `contracts/.env` (key not printed). |
| `npm run check:gas` | Ensures deployer has enough Base Sepolia ETH for deploy (threshold ~`0.000015` ETH). |
| `npm run fund:cdp` | Requests testnet ETH via [Coinbase CDP](https://portal.cdp.coinbase.com/access/api) faucet (requires `CDP_*` in `.env`). |
| `npm run deploy:base` | Deploy token + emissions; writes `deployments/baseSepolia.json`. |
| `npm run netlify:sync-token` | Sets `VITE_TOKEN_ADDRESS` / `VITE_EMISSIONS_ADDRESS` on Netlify (production build scope). |
| `npm run ship:online` | **Pipeline:** CDP fund (if keys set) → `check:gas` → `deploy:base` → Netlify env sync → `netlify deploy --prod --build` from repo root. |
| `npm run epoch:build` | Alias: `node scripts/build-epoch.cjs` (see usage when `--snapshot` / `--policy` missing). |
| `npm run epoch:register` | `registerRoot` on Base Sepolia; pass path to `epoch-*.json` (appends `registerTxHash`). |

Secrets: **`contracts/.env`** — never commit. See `contracts/.env.example`.

## M3 epoch & claim runbook

1. **Export relay state:** `curl -fsS -H "x-indexer-secret: $INDEXER_SECRET" "$RELAY_URL/v1/indexer/snapshot" -o snapshot.json` (requires relay `INDEXER_SECRET`).
2. **Policy:** Copy [`contracts/scripts/example-epoch-policy.json`](../../contracts/scripts/example-epoch-policy.json); set `epochId`, `chainId` **84532**, weights/caps. Optionally set `tokenAddress` / `emissionsAddress` for `--fetch-pool`.
3. **Build allocations + Merkle root** (from `contracts/`):

   ```bash
   node scripts/build-epoch.cjs --snapshot ../snapshot.json --policy scripts/example-epoch-policy.json --out ../epochs \
     --fetch-pool --rpc-url "$BASE_SEPOLIA_RPC_URL" --token 0x… --emissions 0x…
   ```

   Or pass an explicit `--pool-wei` cap (must be ≤ `EmissionsController` DIR balance).

4. **Register root on-chain:** ensure `contracts/deployments/baseSepolia.json` (or `EMISSIONS_ADDRESS`) and deployer key in `contracts/.env`:

   ```bash
   npm run epoch:register -- ../epochs/epoch-<id>.json
   ```

5. **Publish metadata to relay:** `POST /v1/admin/rewards-epochs` with JSON body `{ id, root, chainId, publishedAtMs, registerTxHash?, allocations }` matching the epoch file (same `x-indexer-secret` header).

6. **Claim:** Netlify app must have `VITE_EMISSIONS_ADDRESS` + `VITE_TOKEN_ADDRESS` + chain **84532**. User opens **Rewards** (`/claim`), stays **signed in**, taps **Claim DIR** — the relay submits the transaction (gasless) if **`/health` → `sponsoredClaim: true`**. DIR lands on the **beneficiary** shown (payout address or linked wallet per epoch rules), not necessarily the embedded signing key; check Wallet / block explorer for that address.

Users trust the relay-published `allocations` list matches the on-chain root (verify `root` locally by rebuilding the tree).

## Web build-time env (Netlify)

Set in Netlify UI or via `netlify env:set` / sync script; mirrored in root [`netlify.toml`](../../netlify.toml) `build.environment` where noted:

- `VITE_RELAY_URL` → Fly relay URL (no trailing slash)
- `VITE_CHAIN_ID` → `84532`
- `VITE_RPC_URL` → Base Sepolia RPC
- `VITE_TOKEN_ADDRESS` → DirecTToken
- `VITE_EMISSIONS_ADDRESS` → EmissionsController

## Future work

- **Base mainnet:** Full phased checklist and **beta user credit** (genesis mainnet epoch) → [testnet-to-mainnet-roadmap.md](testnet-to-mainnet-roadmap.md).
- Stronger **manifest trust** (IPFS CID or signed attestations tying `root` to `allocations`).
- Optional **auditable follow** events in the signed protocol instead of relay-only edges.

See [`mvp-scope.md`](../mvp-scope.md) for milestone framing.
