# Deploy DirecT online (Fly.io + Netlify)

This guide wires the **relay API** (Node/Express on [Fly.io](https://fly.io/docs/)) and the **web app** (Vite/React on [Netlify](https://docs.netlify.com/)) so anyone can use the site over HTTPS.

> **Persistence:** The Fly relay stores **accounts**, **sessions**, **events/posts**, **metrics**, and **media** under **`DATA_DIR`** (Fly: **`/data`** volume). Redeploys keep data on the volume.

**Live snapshot (URLs, contract addresses, scripts):** [`current-environment.md`](current-environment.md)

---

## What is already implemented vs not

| Area | Status |
|------|--------|
| Web: auth, profiles, feed (All / Following), My page, settings, **Rewards (`/claim`)**, **wallet hub** (scrollable modal, ETH + DIR), notification bell (social + claimable rewards) | **Live** on Netlify when build env includes `VITE_TOKEN_ADDRESS` + `VITE_EMISSIONS_ADDRESS` for claims (see [`current-environment.md`](current-environment.md)) |
| Relay: signed events, feed, metrics, media, accounts, **indexer snapshot**, **rewards epoch registry**, **follow** graph, extended notifications | **Deployed** on Fly; persists on volume (`relay-state.json`, `events-state.json`, `rewards-epochs.json`, `media/`) |
| Chain verification `CHAIN_ID` on relay | Configurable via env (`84532` Base Sepolia default; align with `VITE_CHAIN_ID`) |
| Contracts: **DIR** + **EmissionsController** on Base Sepolia | **Deployed**; genesis + 10M DIR seed in controller; addresses in local `deployments/baseSepolia.json` + doc snapshot |
| Epoch tooling: **`build-epoch.cjs`**, **`epoch:register`**, operator runbook | **In repo** ([`current-environment.md` § M3](current-environment.md#m3-epoch--claim-runbook)) |
| **One-command ship** (`npm run ship:online` in `contracts/`) | **CDP** optional faucet → gas check → deploy → Netlify env sync → production build ([`contracts/README.md`](../../contracts/README.md)) |
| Full emissions oracle automation (unattended epochs) | **Not** in repo — operators run export → build → register → `POST /v1/admin/rewards-epochs` |

**“Fully works online”** today means: Netlify SPA, Fly relay, matching `VITE_CHAIN_ID` / relay `CHAIN_ID`, token **and** emissions addresses in the Netlify build, and (for epochs) `INDEXER_SECRET` on the relay for snapshot + admin ingest.

---

## Architecture

```text
User browser
    ├── HTTPS → Netlify (static: JS/CSS, React Router)
    │              └── build-time env: VITE_RELAY_URL, VITE_CHAIN_ID, VITE_RPC_URL
    ├── JSON + wallets → Fly relay (Express)  e.g. https://your-relay.fly.dev/v1/...
    └── RPC → L2 (e.g. Base Sepolia) for signing / viem / wagmi
```

---

## Part A — Fly.io (relay)

### Prerequisites

- [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/) installed and logged in: `fly auth login`
- Docker (optional locally; Fly builds in the cloud on deploy)

### First-time deploy

From the **`relay/`** directory:

```bash
cd relay
fly launch
```

- The repo defaults to app name **`morninrage-direct-relay`** in [`relay/fly.toml`](../../relay/fly.toml). If that name is taken globally, pick another and update **`netlify.toml`** `VITE_RELAY_URL` to match.
- Region: **`iad`** in repo config; change in `fly.toml` if you prefer another region.
- **Overwrite** `fly.toml` if prompted, or merge carefully — this repo already includes `relay/fly.toml` tuned for `internal_port = 8080` and `/health` checks.
- **Do not** add Postgres for the minimal MVP unless you plan to implement feed/media persistence.

### Account storage volume (required for production logins)

`relay/fly.toml` mounts a [**Fly volume**](https://fly.io/docs/reference/volumes/) at **`/data`**. Create it once per app (same **region** as the app, e.g. `iad`):

```bash
fly volumes list -a morninrage-direct-relay
# If no volume named morninrage_direct_relay_data:
fly volumes create morninrage_direct_relay_data --region iad --size 1 -a morninrage-direct-relay
```

Then deploy. **Scale this app to a single machine** per region while using one volume (or use LiteFS / external DB for multi-instance).

Set secrets (optional but recommended):

```bash
fly secrets set CHAIN_ID=84532
# Optional: protect POST /v1/events/:eid/view and indexer-only routes
fly secrets set INDEXER_SECRET=$(openssl rand -hex 32)
```

Deploy:

```bash
fly deploy
```

Confirm:

```bash
curl https://<your-app>.fly.dev/health
```

You should see JSON with `"ok": true`.

**Important:** Keep `relay/fly.toml` key `app` in sync with the real Fly app name and with **`VITE_RELAY_URL`** in root **`netlify.toml`** (no trailing slash).

### Environment variables (Fly)

| Variable | Purpose |
|----------|---------|
| `PORT` | **8080** in production (`relay/fly.toml` `[env]`). Fly’s proxy targets `internal_port`; without `PORT`, the server defaulted to **8787** and health checks failed. Local dev: **8787** via `.env`. |
| `DATA_DIR` | **`/data`** in the container (Fly volume). Local dev: `relay/data/` via default. |
| `CHAIN_ID` | EIP-712 verification chain id (default **84532** Base Sepolia). |
| `INDEXER_SECRET` | If set, required on **`x-indexer-secret`** for indexer snapshot (`GET /v1/indexer/snapshot`), admin epoch ingest (`POST /v1/admin/rewards-epochs`), and related routes. Rotate if leaked. |

### Costs / sleep

`min_machines_running = 0` lets the machine **stop** when idle (saves credits); first request may **cold start**. For a demo that must feel instant, set `min_machines_running = 1` in `fly.toml` (uses more usage).

---

## Part B — Netlify (web)

### Prerequisites

- Git repository hosted on **GitHub** — recommended: **`MorninRage/DirecT`**. Netlify **imports from Git**; push the repo first, then connect the site (display name **DirecT** in the dashboard).
- [Netlify CLI](https://docs.netlify.com/cli/get-started/) optional: `npm i -g netlify-cli` then `netlify login`

### Create the site

1. Netlify dashboard → **Add new site** → **Import an existing project**.
2. Connect Git provider → select **this repo**.
3. Netlify reads **root** [`netlify.toml`](../../netlify.toml):
   - **Build:** `npm ci` + `npm run build` with `--prefix apps/web`
   - **Publish directory:** `apps/web/dist` (path from repository root)

### Build environment variables (required)

In **Site configuration → Environment variables → Builds**, add:

| Name | Example value |
|------|----------------|
| `VITE_RELAY_URL` | `https://your-relay.fly.dev` (no trailing slash) |
| `VITE_CHAIN_ID` | `84532` |
| `VITE_RPC_URL` | `https://sepolia.base.org` (or Alchemy/Infura URL) |
| `VITE_TOKEN_ADDRESS` | DirecTToken `0x…` after deploy (enables **DIR** balance in Wallet UI) |
| `VITE_EMISSIONS_ADDRESS` | EmissionsController `0x…` — required for **Rewards /claim** in the web app. |

**Automated flow (recommended for agents / CI):** add Coinbase **CDP** keys to `contracts/.env` and run **`npm run ship:online`** from `contracts/` — funds testnet gas (no browser), deploys, syncs Netlify token env vars, and runs a production Netlify build. See [`contracts/README.md`](../../contracts/README.md).

**Manual flow:** `npm run gen:deployer` → fund deployer on Base Sepolia → `npm run deploy:base` → from repo root `npm run netlify:sync-token --prefix contracts` → trigger a Netlify production deploy.

Redeploy after changing env vars (Vite bakes them in at build time).

### SPA routing

[`netlify.toml`](../../netlify.toml) includes a **rewrite** so `/u/alice`, `/auth`, etc. return `index.html` (React Router).

### MCP / CLI

If you use **Netlify MCP** in Cursor, mirror the same settings (build base `apps/web`, publish `dist`, env vars as above). The MCP cannot replace linking your Git repo in the Netlify UI for continuous deploy unless your workflow uses Git-backed Netlify already.

---

## Part C — CORS and security (MVP)

The relay uses `cors()` wide open — acceptable for early demos. Before mainnet-style launch, restrict origins to your Netlify domain:

Before **Base mainnet** and **beta user credits**, read [testnet-to-mainnet-roadmap.md](testnet-to-mainnet-roadmap.md) (not just env flips).

---

## Part D — End-to-end checklist

1. `fly deploy` → `curl https://<relay>.fly.dev/health` OK.  
2. Netlify build green with `VITE_RELAY_URL` = that relay URL.  
3. Open Netlify URL → sign up → **Wallet** (modal) → **Wallet link** page → sign message and link wallet → post on **My page** → optional **Rewards** if an epoch is published. (Profile fields remain under **Settings**.)  
4. Optional: second browser / incognito → confirm public `/u/:handle` loads.  

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Web loads but “network error” on login | Wrong `VITE_RELAY_URL`, relay down, or mixed content (http relay from https site — use https Fly URL). |
| Signature / chain errors | `CHAIN_ID` mismatch between relay and `VITE_CHAIN_ID`, or wallet on wrong network. |
| 404 on refresh deep link | Netlify SPA redirect missing — check `netlify.toml`. |
| `invalid_credentials` after a correct password | Relay had no volume / cold machine with empty memory; accounts file missing. Create Fly volume, redeploy, **or** re-register. With volume + `DATA_DIR=/data`, accounts survive restarts. |
| Feed or posts “reset” after a while | Old behavior: relay RAM-only. **Current:** posts persist on Fly volume; if you still see loss, check `DATA_DIR` and volume mount. |

---

## Related docs

- [`current-environment.md`](current-environment.md) — **URLs, contract addresses, script inventory** (update on redeploy).  
- [`mvp-scope.md`](../mvp-scope.md) — what “done” means for the product loop.  
- [`protocol/README.md`](../protocol/README.md) — API paths the relay exposes.  
- Fly: [Deploy an app](https://fly.io/docs/getting-started/launch-remix/) pattern matches Docker deploy.  
- Netlify: build runs from the **repository root** with `npm ci --prefix apps/web && npm run build --prefix apps/web` and publish dir **`apps/web/dist`** (see root `netlify.toml`). This is not the `[build] base = "apps/web"` monorepo pattern; either approach is valid, but this repo uses root-scoped commands.
