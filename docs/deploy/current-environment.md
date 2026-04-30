# Current deployment snapshot (testnet / production-aligned)

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

6. **Claim:** Netlify app must have `VITE_EMISSIONS_ADDRESS` + `VITE_TOKEN_ADDRESS` + chain **84532**. User opens **Rewards** (`/claim`), connects the beneficiary wallet, submits `claim`.

Users trust the relay-published `allocations` list matches the on-chain root (verify `root` locally by rebuilding the tree).

## Web build-time env (Netlify)

Set in Netlify UI or via `netlify env:set` / sync script; mirrored in root [`netlify.toml`](../../netlify.toml) `build.environment` where noted:

- `VITE_RELAY_URL` → Fly relay URL (no trailing slash)
- `VITE_CHAIN_ID` → `84532`
- `VITE_RPC_URL` → Base Sepolia RPC
- `VITE_TOKEN_ADDRESS` → DirecTToken
- `VITE_EMISSIONS_ADDRESS` → EmissionsController

## Future work

- Stronger **manifest trust** (IPFS CID or signed attestations tying `root` to `allocations`).
- Optional **auditable follow** events in the signed protocol instead of relay-only edges.

See [`mvp-scope.md`](../mvp-scope.md) for milestone framing.
