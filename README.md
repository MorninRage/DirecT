# DirecT Monorepo

Hybrid decentralized social stack: **relay data plane** + **L2 DIR token** + **MVP web client**.

**Source:** [github.com/MorninRage/DirecT](https://github.com/MorninRage/DirecT) — CI runs **relay**, **web**, and **contracts** tests on push/PR (see [.github/workflows/ci.yml](.github/workflows/ci.yml)). Netlify + Fly setup notes: [.github/README.md](.github/README.md).

## Layout

| Path | Description |
|------|-------------|
| [`docs/`](docs/) | Architecture, protocol, tokenomics, governance, threat model, MVP scope, **deploy snapshot**, legal checklist. |
| [`contracts/`](contracts/) | Hardhat: `DirecTToken`, `EmissionsController` (Merkle payouts); `ship:online` for testnet + Netlify. |
| [`relay/`](relay/) | HTTP relay: signed events, feed, metrics v0, accounts, notifications (social). |
| [`apps/web/`](apps/web/) | Vite + React + wagmi: wallet connect, sign & post, feed, DIR balance, notification bell. |

## Production (testnet) snapshot

| | |
|--|--|
| **Web** | [https://direct-social.netlify.app](https://direct-social.netlify.app) |
| **Relay** | [https://morninrage-direct-relay.fly.dev](https://morninrage-direct-relay.fly.dev) |
| **Chain** | Base Sepolia (84532) |
| **Detail** | [`docs/deploy/current-environment.md`](docs/deploy/current-environment.md) — contract addresses, scripts, env vars |

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

## Deploy / ship online

Full checklist: **[`docs/deploy/online.md`](docs/deploy/online.md)** — after changing Fly or Netlify URLs or redeploying contracts, keep **[`docs/deploy/current-environment.md`](docs/deploy/current-environment.md)**, root **`netlify.toml`**, and **`relay/fly.toml`** in sync (see [.github/README.md](.github/README.md)).

**One command** (from `contracts/`, Netlify CLI logged in, CDP keys in `contracts/.env` optional but recommended for no-browser gas):

```bash
cd contracts
npm install
npm run ship:online
```

See [`contracts/README.md`](contracts/README.md) for `gen:deployer`, `deploy:base`, `fund:cdp`, and manual flows.

## Documentation index

- [Status & roadmap (capabilities + what’s next)](docs/STATUS-AND-ROADMAP.md)
- [GitHub: CI + linking Netlify/Fly](.github/README.md)
- [First epoch cookbook (copy-paste operator steps)](docs/deploy/first-epoch-cookbook.md)  
- [Current environment (live URLs + contracts)](docs/deploy/current-environment.md)  
- [Deploy online — Fly + Netlify](docs/deploy/online.md)  
- [Settlement decision (L2-first)](docs/architecture/settlement-decision.md)  
- [Protocol (EIP-712 + relay API)](docs/protocol/README.md)  
- [Threat model](docs/security/threat-model.md)  
- [Tokenomics](docs/economics/tokenomics.md)  
- [Governance](docs/governance/governance.md)  
- [MVP scope](docs/mvp-scope.md)  
- [Legal checklist](docs/legal/counsel-checklist.md)  

## License

MIT (see `LICENSE` if present; add one before public distribution).
