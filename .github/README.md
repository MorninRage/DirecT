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
2. Netlify reads root [`netlify.toml`](../netlify.toml): base `apps/web`, publish `apps/web/dist`.
3. Set build env vars per [`docs/deploy/current-environment.md`](../docs/deploy/current-environment.md).

## Fly.io

Deploy relay from `relay/` (`fly deploy`). App name and volume are defined in [`relay/fly.toml`](../relay/fly.toml). Secrets (`CHAIN_ID`, `INDEXER_SECRET`, …) are **not** stored in Git — set via `fly secrets set`.
