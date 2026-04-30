# Deploy DirecT online (Fly.io + Netlify)

This guide wires the **relay API** (Node/Express on [Fly.io](https://fly.io/docs/)) and the **web app** (Vite/React on [Netlify](https://docs.netlify.com/)) so anyone can use the site over HTTPS.

> **Reality check (MVP):** The relay keeps **accounts, posts, and media in memory**. A Fly **machine restart** or **new deploy** **wipes** that data unless you add a database or volume later. That is fine for demos; plan persistence before marketing “permanent” profiles.

---

## What is already implemented vs not

| Area | Status |
|------|--------|
| Web: auth, profiles, feed, My page, settings, notifications (client + relay) | **Working** against a running relay |
| Relay: signed events, feed, metrics, media, accounts API | **Working** (in-memory) |
| Chain verification `CHAIN_ID` on relay | Configurable via env (`84532` Base Sepolia default) |
| Contracts: DIR + EmissionsController | **In repo**; **not required** for read/post MVP if you only exercise relay + wallets |
| Production persistence (Postgres/S3) | **Not** in repo |
| Merkle payouts / emissions oracle wired to web | **Stub / testnet path** per [`mvp-scope.md`](../mvp-scope.md) |

**“Fully works online”** for the current codebase means: **Netlify URL** loads the SPA, **Fly URL** serves `/v1/*`, and the SPA’s **`VITE_RELAY_URL`** points at Fly. Wallets still talk to **`VITE_RPC_URL`** on Base Sepolia (or whatever L2 you configure).

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
- **Do not** add Postgres for the minimal MVP unless you plan to implement persistence.

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
| `PORT` | Set to **8080** in this repo’s `fly.toml` `[env]` — must match `internal_port`. |
| `CHAIN_ID` | EIP-712 verification chain id (default **84532** Base Sepolia). |
| `INDEXER_SECRET` | If set, protects indexer-style `POST /v1/events/:eid/view` per relay code. |

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
   - **Base directory:** `apps/web` (set via `base`)
   - **Build command:** `npm run build`
   - **Publish directory:** `apps/web/dist` (relative to **repository root**; required when using `base`)

### Build environment variables (required)

In **Site configuration → Environment variables → Builds**, add:

| Name | Example value |
|------|----------------|
| `VITE_RELAY_URL` | `https://your-relay.fly.dev` (no trailing slash) |
| `VITE_CHAIN_ID` | `84532` |
| `VITE_RPC_URL` | `https://sepolia.base.org` (or Alchemy/Infura URL) |

Redeploy after changing env vars (Vite bakes them in at build time).

### SPA routing

[`netlify.toml`](../../netlify.toml) includes a **rewrite** so `/u/alice`, `/auth`, etc. return `index.html` (React Router).

### MCP / CLI

If you use **Netlify MCP** in Cursor, mirror the same settings (build base `apps/web`, publish `dist`, env vars as above). The MCP cannot replace linking your Git repo in the Netlify UI for continuous deploy unless your workflow uses Git-backed Netlify already.

---

## Part C — CORS and security (MVP)

The relay uses `cors()` wide open — acceptable for early demos. Before mainnet-style launch, restrict origins to your Netlify domain:

- e.g. set `origin: ["https://your-site.netlify.app"]` in relay — code change not yet in repo.

---

## Part D — End-to-end checklist

1. `fly deploy` → `curl https://<relay>.fly.dev/health` OK.  
2. Netlify build green with `VITE_RELAY_URL` = that relay URL.  
3. Open Netlify URL → sign up → Wallet → link → post on My page.  
4. Optional: second browser / incognito → confirm public `/u/:handle` loads.  

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Web loads but “network error” on login | Wrong `VITE_RELAY_URL`, relay down, or mixed content (http relay from https site — use https Fly URL). |
| Signature / chain errors | `CHAIN_ID` mismatch between relay and `VITE_CHAIN_ID`, or wallet on wrong network. |
| 404 on refresh deep link | Netlify SPA redirect missing — check `netlify.toml`. |
| Data disappeared | Relay restarted — in-memory state lost; expected for MVP. |

---

## Related docs

- [`mvp-scope.md`](../mvp-scope.md) — what “done” means for the product loop.  
- [`protocol/README.md`](../protocol/README.md) — API paths the relay exposes.  
- Fly: [Deploy an app](https://fly.io/docs/getting-started/launch-remix/) pattern matches Docker deploy.  
- Netlify: [Monorepos](https://docs.netlify.com/configure-builds/monorepos/) — `base` in `netlify.toml` handles `apps/web`.
