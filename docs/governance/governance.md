# DirecT governance (v0)

**Model:** On-chain **OpenZeppelin Governor**-style voting (token-weighted) with **timelock**, **proposal types**, and **constitutional guardrails** against plutocratic capture.

## Principles

1. **Direct democracy:** Any delegate meeting **proposal threshold** can submit; token holders vote **for / against / abstain**.
2. **Non-plutocracy hygiene:** High-impact changes require **supermajority** and/or **minimum quorum**; optional **secondary signals** later (e.g. citizen NFT quorum for UX-only votes—out of MVP scope).

## Roles

| Role | Description |
|------|-------------|
| **DIR holders** | Vote weight = token balance at snapshot block (delegation supported). |
| **Executor** | `TimelockController` executes successful proposals after delay. |
| **Guardian (optional early phase)** | Narrow veto only for **clear malicious proposals** or legal escalation—sunset after decentralization milestone (documented in deployment). |

## Proposal types

| Type | Class | Examples | Vote threshold | Timelock |
|------|--------|----------|----------------|----------|
| **Standard** | `STANDARD` | UI defaults, fee bps on tips, indexer weight tweaks | **Majority (>50%)** on FOR + **4% quorum** of supply | **2 days** |
| **Treasury spend** | `TREASURY` | Grant program, service payments ≤ X% treasury | **55%** + **6% quorum** | **3 days** |
| **Constitutional** | `CONSTITUTIONAL` | Raise inflation cap, change timelock duration, upgrade proxy implementations, bridge to app-chain | **66% FOR** + **12% quorum** | **7 days** |
| **Emergency** | `EMERGENCY` | Pause minting / emissions on exploit | **Preset multisig OR** 66% + low quorum | **0–1 day** (template only—implementation optional) |

Quorum is **fraction of total supply** (basis points) participating (FOR + AGAINST, exclude abstain unless governance decides otherwise at deploy).

## Anti-plutocracy guardrails

1. **Separate proposal thresholds:**  
   - Standard: **0.25%** of supply to propose.  
   - Constitutional: **2%** of supply to propose (or delegate aggregation).

2. **Cap sensitivity:** Parameters affecting **per-creator emissions cap** and **oracle challenge window** require at least **Treasury** tier.

3. **No retroactive dilution** without Constitutional vote.

4. **Delegation transparency:** UI encourages self-delegation or known delegates; documentation discourages silent vote-buying (social layer).

## Lifecycle

1. **Draft** — Snapshot block chosen in proposal.  
2. **Active** — Voting period **7 days** (Standard/Treasury), **14 days** (Constitutional).  
3. **Succeeded / Defeated** — Quorum + threshold checked.  
4. **Queued** — Timelock ETA set.  
5. **Executed** — After timelock, anyone calls `execute`.

## Off-chain coordination

- **Forum / GitHub**: Executable specs (EIP-style) **MUST** link from proposal description hash stored on-chain or IPFS CID in proposal calldata.

## MVP implementation mapping

| Concept | Contract / module |
|---------|-------------------|
| Governor | `GovernorVotes` + `GovernorCountingSimple` (OZ) |
| Token voting | `ERC20Votes` (checkpointed balances) |
| Timelock | `TimelockController` with **proposer** = governor, **executor** = anyone or restricted |
| Constitution | Off-chain charter + on-chain **parameter guard** contract (optional) limiting `setInflationCap` etc. |

See `contracts/` for concrete deployment.
