# DirecT Monorepo

Hybrid decentralized social stack: **relay data plane** + **L2 DIR token** + **MVP web client**.

## Layout

| Path | Description |
|------|-------------|
| [`docs/`](docs/) | Architecture, protocol, tokenomics, governance, threat model, MVP scope, legal checklist. |
| [`contracts/`](contracts/) | Hardhat: `DirecTToken`, `EmissionsController` (Merkle + testnet payout). |
| [`relay/`](relay/) | HTTP relay: signed events, feed, metrics v0. |
| [`apps/web/`](apps/web/) | Vite + React + wagmi: wallet connect, sign & post, feed, demo metrics. |

## Quick start (local)

### 1. Relay

```bash
cd relay
npm install
# Optional: copy .env.example → .env
npm run dev
```

### 2. Web

```bash
cd apps/web
npm install
# Set VITE_RELAY_URL=http://127.0.0.1:8787 and VITE_CHAIN_ID=84532 and VITE_RPC_URL=...
npm run dev
```

Use a wallet on the **same chain ID** as the relay (`CHAIN_ID` env, default `84532` Base Sepolia).

## Deploy online (Fly.io + Netlify)

Host as **MorninRage** on GitHub, Netlify site **DirecT**, relay **`morninrage-direct-relay.fly.dev`** (change names in `relay/fly.toml` + `netlify.toml` if needed).

Full steps, env vars, and troubleshooting: **[`docs/deploy/online.md`](docs/deploy/online.md)**.

- **GitHub:** `https://github.com/MorninRage/DirecT`  
- **Fly.io** — host the **`relay/`** API (Dockerfile + `relay/fly.toml`).  
- **Netlify** — import **MorninRage/DirecT**; root **`netlify.toml`** sets monorepo base + SPA redirects + `VITE_*` for the relay.  
- **Netlify does not host Git** — it builds from your GitHub repo.

### 3. Contracts

```bash
cd contracts
npm install
npx hardhat test
```

## Documentation index

- [Settlement decision (L2-first)](docs/architecture/settlement-decision.md)  
- [Protocol (EIP-712 + relay API)](docs/protocol/README.md)  
- [Threat model](docs/security/threat-model.md)  
- [Tokenomics](docs/economics/tokenomics.md)  
- [Governance](docs/governance/governance.md)  
- [MVP scope](docs/mvp-scope.md)  
- [Deploy online — Fly + Netlify](docs/deploy/online.md)  
- [Legal checklist](docs/legal/counsel-checklist.md)  

## License

MIT (see `LICENSE` if present; add one before public distribution).
