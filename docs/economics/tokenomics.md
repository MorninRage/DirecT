# DirecT tokenomics (v0)

> **Narrative + analogies:** For a long-form explanation of how content, metrics, and DIR relate (with examples), see `[explanation/tokens-blockchain-and-content.md](../explanation/tokens-blockchain-and-content.md)`.

**Token:** DIR — ERC-20 on chosen L2 (see [settlement-decision.md](../architecture/settlement-decision.md)).

## Where initial DIR come from (one paragraph)

**Initial supply** is decided at **genesis** (contract deployment / vault funding): a **total** is fixed (example below: 1B DIR) and split into **buckets** (community, team, treasury, liquidity, early users). **Posting does not mint those buckets.** Creator rewards are paid from the **community emissions** bucket over years, in **epoch slices** R_e, allocated by the engagement formula. Plain-language walkthrough: `[explanation/tokens-blockchain-and-content.md](../explanation/tokens-blockchain-and-content.md)` §2.

## Supply (initial model)


| Bucket                      | % of genesis | Notes                                                                          |
| --------------------------- | ------------ | ------------------------------------------------------------------------------ |
| **Community emissions**     | 40%          | Released over **10 years** via engagement + ecosystem programs.                |
| **Team & contributors**     | 20%          | **48-month linear vest** from TGE; voting may be escrowed or limited pre-vest. |
| **Treasury / DAO**          | 25%          | On-chain timelock; spends via governance.                                      |
| **Liquidity & listings**    | 10%          | DEX pairs, MM loans, CEX deposits—governance-approved.                         |
| **Early users / bootstrap** | 5%           | Retroactive or phased airdrop; anti-Sybil rules.                               |


**Total supply (example):** **1,000,000,000 DIR** (`1e9 * 1e18` wei). Exact figure governance-canonical in deployment.

**Inflation after genesis:** Optional **low annual tail** (e.g. ≤ 2% ) for security budget—**capped by constitutional governor** (requires supermajority + timelock).

## Sinks (demand pressure)

1. **In-app purchases** (boosts, premium relay QoS, cosmetics) — burn optional %.
2. **Tips** — optional protocol fee to treasury (basis points).
3. **Governance bonds / stakes** — DIR locked for indexer or relay roles (not burned but removed from float).

## Engagement payout formula v0

Let R_e be **reward pool** for epoch e (DIR, from emissions schedule).

For each **content piece** c (post) with finalized engagement scores after oracle finality:

- V_c = verified weighted views  
- L_c = weighted likes  
- C_c = weighted comments  
- S_c = weighted shares  
- Q_c \in (0, 1] = quality / abuse discount from indexer policy (default 1)

**Raw score:**

  \text{score}_c = w_V \log(1+V_c) + w_L \log(1+L_c) + w_C \log(1+C_c) + w_S \log(1+S_c)

**Initial weights (tunable by governance):**  
w_V=1.0,\ w_L=2.0,\ w_C=3.0,\ w_S=2.5 — comments weighted higher than raw views to reduce cheap impression farms.

**Creator allocation:**

  \text{payout}*{c} = R_e \cdot \frac{\text{score}c \cdot Q_c}{\sum{c' \in E} \text{score}*{c'} \cdot Q_{c'}}

Where E is the set of eligible posts in epoch (minimum quality threshold, not delisted for policy).

**Per-creator cap:** Each creator’s \sum_{c \in \text{author}} \text{payout}_c **≤** `CAP_FRACTION * R_e` (e.g. 5%) to limit whale-post dominance.

**Floor:** De-minimis scores below `epsilon` receive zero to save gas (off-chain rollups batch claims).

## Emissions schedule (piecewise)

- **Years 0–2:** 40% of community emissions budget (of total pool above) — highest to bootstrap.
- **Years 3–5:** 35%.
- **Years 6–10:** 25%.

Within each year, **equal weekly epochs** unless governance adjusts cadence within constitutional bounds.

## Governance caps (economic constitution)

- **Max step-up in annual inflation:** e.g. +0.5% absolute per year only via supermajority proposal.
- **Min treasury runway:** governance **cannot** vote to drain below **N months** burn (optional invariant in charter, enforced socially + multisig guardian in early phase if used).

## Parameter table (MVP defaults)


| Parameter      | Default         | Governance tier          |
| -------------- | --------------- | ------------------------ |
| Epoch length   | 1 week          | Standard vote            |
| Weights w_*    | See above       | Standard vote            |
| `CAP_FRACTION` | 5%              | Standard vote            |
| Payout delay   | 7 days finality | Constitutional max bound |


## Upgrade path to app-chain

If migrated, **circulating DIR** may be represented as:

1. **Lock-and-mint bridge** on L2 with mint on app-chain, or
2. **One-way claim** snapshot (governance vote).

Bridge parameters require **constitutional** proposal class.