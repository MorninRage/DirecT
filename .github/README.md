# GitHub — CI and repo links

**Repository:** [github.com/MorninRage/DirecT](https://github.com/MorninRage/DirecT)

## Continuous integration

Workflow **CI** (`.github/workflows/ci.yml`) runs on push and pull requests to `main`:

- **relay** — `npm ci` + `npm run build`
- **web** — `npm ci` + `npm run build` (Vite uses defaults from `config.ts` when env vars are absent)
- **contracts** — `npm ci` + `hardhat compile` + `hardhat test`

Fix failures locally before merging.

## Connecting Netlify to Git

1. Netlify → **Add site** → **Import from Git** → choose **MorninRage/DirecT**.
2. Netlify reads **repository root** [`netlify.toml`](../netlify.toml):
   - **Build command:** `npm ci --prefix apps/web && npm run build --prefix apps/web` (runs from repo root; there is no `[build] base` key).
   - **Publish directory:** `apps/web/dist` (relative to repo root).
3. In **Site configuration → Environment variables → Builds**, set at least what root `netlify.toml` does **not** carry for production: `VITE_TOKEN_ADDRESS`, `VITE_EMISSIONS_ADDRESS` (use [`contracts/README.md`](../contracts/README.md) `netlify:sync-token` or Netlify UI). Confirm `VITE_RELAY_URL` matches your Fly app URL (no trailing slash).
4. Full variable list and operator scripts: [`docs/deploy/current-environment.md`](../docs/deploy/current-environment.md).

## Fly.io

Deploy relay from `relay/`:

```bash
cd relay
fly deploy
```

App name and volume are defined in [`relay/fly.toml`](../relay/fly.toml). Secrets (`CHAIN_ID`, `INDEXER_SECRET`, `RELAYER_PRIVATE_KEY`, `EMISSIONS_ADDRESS`, …) are **not** in Git — set with `fly secrets set` (see [`docs/deploy/online.md`](../docs/deploy/online.md)).

## When URLs or contracts change (keep Git + Netlify + Fly aligned)

Update these together so newcomers and automated builds do not drift:

| Change | Files / actions |
|--------|------------------|
| New Fly app name or relay hostname | [`relay/fly.toml`](../relay/fly.toml) `app`; root [`netlify.toml`](../netlify.toml) `VITE_RELAY_URL`; [`docs/deploy/current-environment.md`](../docs/deploy/current-environment.md); curl examples in docs that hardcode the old host |
| New Netlify site or production domain | [`docs/deploy/current-environment.md`](../docs/deploy/current-environment.md); [README.md](../README.md) snapshot table; CORS hardening note in [`docs/deploy/online.md`](../docs/deploy/online.md) |
| Redeployed token / emissions contracts | Local `contracts/deployments/` JSON; run `npm run netlify:sync-token --prefix contracts`; refresh contract table in [`docs/deploy/current-environment.md`](../docs/deploy/current-environment.md); production Netlify **redeploy** (Vite inlines env at build time) |
| New relay capabilities worth documenting | [`docs/protocol/README.md`](../docs/protocol/README.md) and [`docs/deploy/online.md`](../docs/deploy/online.md) if operator-facing |

**Git:** push to `main`; CI does **not** deploy Fly or Netlify — it only runs [`ci.yml`](workflows/ci.yml) tests. Releases are still manual: `fly deploy`, Netlify Git build or `netlify deploy --prod`, plus env sync as above.
