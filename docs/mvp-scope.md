# DirecT MVP scope

**Full narrative (what exists + what’s next):** [status-and-roadmap.md](STATUS-AND-ROADMAP.md)

**Goal:** Prove the loop: **wallet identity → post/read via relay → engagement metrics v0 → testnet DIR payouts.**

## Current status (April 2026)

| Milestone | Status | Notes |
|-----------|--------|--------|
| **M1** Relay + web post/read signed payloads | **Done** | Web on Netlify, relay on Fly, persistence on Fly volume |
| **M2** Contracts on testnet; DIR minted to treasury | **Done** | Base Sepolia: `DirecTToken` + `EmissionsController`; 1B DIR genesis to deployer; 10M DIR in controller pool |
| **M3** Metrics export → Merkle → test payout | **Done (code)** | Operator must run [epoch runbook](deploy/current-environment.md#m3-epoch--claim-runbook) + [publish to relay](deploy/current-environment.md#why-rewards-shows-no-epoch-published-on-the-relay-yet) for users to see Rewards; proves “paid users” on testnet. |

**Live snapshot:** [deploy/current-environment.md](deploy/current-environment.md) (URLs, contract table, `ship:online` script list).

## In scope (MVP)

1. **Wallet login:** Browser wallet (EIP-1193) connect + chain switch to configured L2 testnet.
2. **Post / read:** Create signed events per [protocol spec](protocol/README.md); submit to relay; list global and author feeds.
3. **Indexer metrics v0:** Relay tracks per-`eid` counters (views placeholder via API, likes/comments/shares from event types); optional **indexer key** for batch export.
4. **Testnet payouts:** `DirecTToken` + `EmissionsController` on testnet; **owner/governance-lite** can seed epochs and publish Merkle roots; creators **claim** from the controller balance (no mint-on-claim).

## Out of scope (MVP)

- Mobile native apps.
- Full staked indexer quorum + slashing.
- Production moderation / appeal UI.
- Mainnet deployment audit.
- **Friend/follow** v1 is **in repo** (asymmetric follow, following feed, bell). **Out of scope for now:** signed portable follow events, global follow graph across many relays, and full relationship product (blocks, mutes, recommendations).

## Repository map

| Path | Purpose |
|------|---------|
| [`contracts/`](../contracts) | **Hardhat** (default): DIR token, `EmissionsController`, Merkle tests; optional Foundry (`foundry.toml`) |
| [`relay/`](../relay) | HTTP relay: signed events, feed, metrics, accounts, media |
| [`apps/web/`](../apps/web) | Vite + React + wagmi: connect, post, feed, wallet dashboard, social notification bell |

## Milestones

1. **M1:** Relay + web can post and read same chain-signed payloads. — **Complete**
2. **M2:** Deploy contracts to testnet; mint test DIR to treasury. — **Complete**
3. **M3:** Record engagement; export snapshot; Merkle epoch; `registerRoot`; publish epoch to relay; creator **claim** from web `/claim`. — **Complete** (runbook: [deploy/current-environment.md](deploy/current-environment.md#m3-epoch--claim-runbook))

## M3 checklist (operator)

1. Set `INDEXER_SECRET` on relay; download `GET /v1/indexer/snapshot`.
2. `cd contracts` → `node scripts/build-epoch.cjs --snapshot … --policy scripts/example-epoch-policy.json --out ../epochs [--pool-wei … | --fetch-pool …]`.
3. `npm run epoch:register -- ../epochs/epoch-….json` (writes `registerTxHash` into the file).
4. `POST /v1/admin/rewards-epochs` with body matching the artifact (see [protocol/README.md](protocol/README.md)).
5. Open web **Rewards** with a wallet that matches an allocation; claim on Base Sepolia.

## Environment

- **Node 22+** (Netlify / local); **npm** (repo uses npm in `contracts/`, `relay/`, `apps/web/`).
- **Primary contracts toolchain:** **Hardhat** (Windows-friendly); Foundry optional.
- `relay/.env`: `PORT`, `INDEXER_SECRET` (optional).
- `contracts/.env`: `DEPLOYER_PRIVATE_KEY`; optional `CDP_*` for [programmatic testnet faucet](https://portal.cdp.coinbase.com/access/api); optional `BASE_SEPOLIA_RPC_URL`.
- Production web: Netlify build env — `VITE_CHAIN_ID`, `VITE_RPC_URL`, `VITE_RELAY_URL`, `VITE_TOKEN_ADDRESS`, `VITE_EMISSIONS_ADDRESS` (see `netlify.toml`).
