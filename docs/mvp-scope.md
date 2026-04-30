# DirecT MVP scope

**Goal:** Prove the loop: **wallet identity → post/read via relay → engagement metrics v0 → testnet DIR payouts.**

## In scope (MVP)

1. **Wallet login:** Browser wallet (EIP-1193) connect + chain switch to configured L2 testnet.
2. **Post / read:** Create signed events per [protocol spec](../protocol/README.md); submit to relay; list global and author feeds.
3. **Indexer metrics v0:** Relay tracks per-`eid` counters (views placeholder via API, likes/comments/shares from event types); optional **indexer key** for batch export.
4. **Testnet payouts:** `DirecTToken` + `EmissionsController` on testnet; **owner/governance-lite** can seed epochs and `mint` creator allocations from a Merkle tree or allowlisted amounts (placeholder for full oracle).

## Out of scope (MVP)

- Mobile native apps.
- Full staked indexer quorum + slashing.
- Production moderation / appeal UI.
- Mainnet deployment audit.

## Repository map

| Path | Purpose |
|------|---------|
| [`contracts/`](../contracts) | Foundry: DIR token, emissions stub, tests |
| [`relay/`](../relay) | Minimal HTTP relay (Node + TypeScript) |
| [`apps/web/`](../apps/web) | Vite + React + viem: connect, post, feed |

## Milestones

1. **M1:** Relay + web can post and read same chain-signed payloads.
2. **M2:** Deploy contracts to testnet; mint test DIR to treasury.
3. **M3:** Record simple engagement counts; export JSON for Merkle batch; execute one test payout to creator address.

## Environment

- **Node 20+**, **pnpm** (or npm).
- **Foundry** (`forge`) for Solidity.
- `relay/.env`: `PORT`, `INDEXER_SECRET` (optional).
- `apps/web/.env`: `VITE_CHAIN_ID`, `VITE_RPC_URL`, `VITE_RELAY_URL`, `VITE_TOKEN_ADDRESS`, `VITE_EMISSIONS_ADDRESS`.
