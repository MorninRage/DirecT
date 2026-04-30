# DirecT threat model: Sybil, payouts, and engagement oracles

**Version:** 0.1  
**Scope:** Engagement-weighted token emission, indexer/relay network, creator payouts.

## Assets


| Asset                      | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| **DIR token supply**       | Minted per emissions policy; treasury allocations.              |
| **Creator reward budgets** | Per-epoch pool distributed by verified engagement.              |
| **Reputation / tiers**     | Non-transferable or slowly-transferable signals affecting caps. |
| **Indexer stakes**         | Collateral securing honest aggregation and uptime.              |
| **User content & graph**   | Posts, follows; availability on relays/PDS.                     |


## Adversaries

1. **Sybil operator:** Many low-cost identities farming impressions, likes, shares.
2. **Colluding relays/indexers:** Signing false delivery receipts or inflating metrics.
3. **Creator + bot ring:** Coordinated fake engagement on own content.
4. **Rational spammer:** Maximizes payout per unit cost until marginal revenue = marginal Sybil cost.
5. **Governance attacker:** Acquires voting power to raise emissions or redirect treasury.

## Threats and mitigations

### T1: Inflated impressions / views

- **Risk:** Clients or a single relay report inflated views; payouts drain emissions pool.
- **Mitigations:**
  - **Signed delivery receipts** from multiple independent relays; **median / trimmed-mean** aggregation; drop outlier relays for the epoch.
  - **Rate limits** per identity tier and per content hash window.
  - **Sampling:** Random re-fetch or witness checks on a subset of impressions.
  - **Slow finality for rewards:** Metrics used for minting finalized **24–168h** after wall time; reversions possible before finalization.

### T2: Like/comment/share farms

- **Risk:** Bot accounts create shallow engagement loops.
- **Mitigations:**
  - **Engagement quality score:** Weight unique commenters, account age, stake tier, graph distance from author.
  - **Diminishing returns** on repeated interactions from same cluster (graph-based Sybil resistance).
  - **Cooldowns** between high-weight actions from new accounts.

### T3: Indexer collusion

- **Risk:** Majority of staked indexers agree on false aggregates.
- **Mitigations:**
  - **Geographic / operator diversity** requirements for quorum.
  - **Slashing** on dispute loss; **challenge period** with public fraud proofs (incorrect Merkle root over signed relay attestations).
  - **Small honest minority assumption:** Economic security = cost to corrupt quorum vs. stake at risk (tune parameters).

### T4: Governance capture

- **Risk:** Whale buys votes; votes to mint unsustainable emissions.
- **Mitigations:**
  - **Constitutional caps** on max annual inflation (separate high-threshold proposal type).
  - **Timelocks** on mint parameter changes.
  - Optional **second chamber** or **quadratic voting** for non-financial parameters (documented in governance spec).

### T5: Oracle / data withholding

- **Risk:** Censorship of proofs or selective omission.
- **Mitigations:**
  - Open **relay gossip**; users can submit attestations to multiple indexers.
  - **Data availability** requirement: commitment to blob hashes on L2 or DA layer.

## Engagement finality rules (v0)


| Stage                | Duration (indicative) | Meaning                                                          |
| -------------------- | --------------------- | ---------------------------------------------------------------- |
| **Fast path (UX)**   | Immediate             | Users see provisional counts in-app.                             |
| **Relay quorum**     | 1–24h                 | Minimum distinct relay signatures for impression batch.          |
| **Indexer commit**   | Per epoch (e.g. 1h)   | Staked indexers publish Merkle root of aggregates.               |
| **Challenge window** | 24–72h                | Disputes open; slashing resolution.                              |
| **Payout finality**  | After challenge       | Emissions contract mints to creator accounts per finalized root. |


Exact windows are governance-tunable within constitutional max delays.

## Out of scope (v0)

- Formal verification of ranking ML.
- Full ZK privacy for impressions (future design).

## References

Aligned with plan: Sybil-resistant reward design discussions in industry and research (e.g. subgraph-based Sybil detection literature, governance reward design). Internal: [settlement-decision.md](../architecture/settlement-decision.md).