# DirecT settlement layer decision

**Decision:** **L2-first** with an **ERC-20–compatible** DirecT token on an established Ethereum Layer 2.

**Status:** Accepted for Phase 1 (MVP through initial liquidity).

## Rationale

- **Liquidity and tooling:** DEXs, wallets, bridges, and on/off-ramp partners target EVM L2s first; aligns with “usable like other crypto.”
- **Time to market:** Smart contracts, audits, and governance modules reuse mature patterns (OpenZeppelin, Governor, etc.).
- **Operational cost:** No standalone validator set or IBC-like bridge to bootstrap on day one.

## App-chain fork criteria (Phase 2+)

Re-evaluate a dedicated **app-chain** (e.g. Cosmos SDK, OP Stack app-rollup) if any of the following become blocking:

1. **Throughput / fee economics:** Social action volume routinely exceeds comfortable L2 gas budgets even with batching.
2. **Custom mempool rules:** Protocol-enforced ordering or spam controls require L1-grade control.
3. **Regulatory / jurisdictional** need for isolated execution domain (counsel-directed).

## Implementation note

Contracts in this repo target **Solidity** on an L2 testnet (chain ID configurable). A future app-chain would require token **mint/burn bridge** or **migration governance vote**—out of scope for MVP contracts beyond documenting the upgrade path in governance specs.
