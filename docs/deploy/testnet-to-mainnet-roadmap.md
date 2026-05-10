# Roadmap: Base Sepolia (testnet) → Base (mainnet)

**Last updated:** April 2026.

**Why this doc exists:** Earlier deploy docs focused on **getting testnet working**. This file adds **full cutover context**: new chain state, treasury, **and how beta users can keep credited rewards on mainnet** using the **same Merkle + `claim` system** you already run—not a separate “migration app.”

**Reality check:** Mainnet is **not** “flip env and the same token becomes real.” Sepolia and Base mainnet are **different ledgers**. **Sepolia balances do not auto-copy.** Preserving beta amounts is a **policy + operator export + one special epoch**, described in **§4**.

---

## 1. How the on-chain economy works (reference deploy)

From `contracts/scripts/deploy.ts` (same pattern applies on any chain you deploy to):

| Step | What happens |
|------|----------------|
| **Deploy** | `DirecTToken` owned by deployer; `EmissionsController` owned by deployer, references token. |
| **Genesis mint** | **1,000,000,000 DIR** minted to **deployer** (treasury), capped by `MAX_SUPPLY`. |
| **Rewards pool** | **10,000,000 DIR** transferred deployer → **EmissionsController** for Merkle **`claim`** payouts (MVP default; tune per launch). |
| **Treasury remainder** | **~990M DIR** stays on deployer until transferred, burned, or minted via **`minters`** (no mint-on-claim in `claim()`). |

**Claims:** `claim` moves DIR **from the controller balance** to the beneficiary. The contract does **not** mint new DIR when users claim.

On **mainnet**, you **run the deploy again** (new addresses). Economics (pool size, multisig, vesting) are a **launch policy** choice.

---

## 2. What changes technically (testnet → mainnet)

| Layer | Testnet (today) | Mainnet (production) |
|--------|------------------|----------------------|
| **Chain** | Base Sepolia (`84532`) | Base (`8453`) |
| **Contracts** | Current token + emissions addresses | **New deployment** → **new addresses** |
| **Balances** | Sepolia DIR / ETH | **New ledger**; fund pool + treasury from ops |
| **Web** | `VITE_*` for Sepolia | **New production build** with mainnet `VITE_CHAIN_ID`, RPC, addresses |
| **Relay** | Sepolia RPC + secrets | **Mainnet** RPC, `EMISSIONS_ADDRESS`, relayer with **real ETH** |
| **Explorer** | `sepolia.basescan.org` | `basescan.org` |

Same **repo and flows** (epoch JSON → `registerRoot` → `POST /v1/admin/rewards-epochs` → `/claim`); **different network state**.

---

## 3. Impact on users and DIR

### 3.1 App accounts (relay)

Handles, sessions, **`linkedWallets`**, **`payoutAddress`**: **not chain-locked**. Production can keep **one relay** and point the web at mainnet `VITE_*`. Users may need a **deadline** to finalize payout/linked addresses before a **beta snapshot** (§4).

### 3.2 Sepolia DIR (beta)

- Stays on Sepolia **forever** as a record of beta.
- **Does not appear on mainnet** unless you execute a **credit plan** (§4).

### 3.3 Mainnet DIR

- **New** token contract → balances start from **zero** until you transfer/mint and users claim.
- **“Real”** in the economic sense also needs **markets, trust, compliance** you choose outside this doc.

---

## 4. Beta user credit preservation (planned model)

**Product intent:** Keep **the same system**—Merkle roots, **`EmissionsController.claim`**, relay-published epochs, gasless relay option. **Do not** invent a second payout mechanism for migration.

**Idea:** The **first mainnet epoch** (or a dedicated **`beta-credit-YYYYMM`** epoch id) has **`allocations`** = *how much each beneficiary should receive as credit for beta*, per your snapshot rule. You **`registerRoot`** on **mainnet**, **`POST`** to relay, users **`claim`** like any other epoch.

Nothing auto-migrates: you **export numbers once**, **freeze** them, **fund the mainnet controller** with **≥ sum(allocations)** you publish, then run the normal operator steps.

### 4.1 Choose a snapshot rule (pick one explicit policy)

| Rule | What you measure | Pros / cons |
|------|-------------------|-------------|
| **A — Cumulative earned (recommended)** | Sum **`amountWei`** per **beneficiary** across **all relay-published testnet epochs** you honor (from epoch JSON history + `rewards-epochs` on relay backup). | Matches “rewards DirecT assigned.” Ignores random testnet transfers. |
| **B — On-chain balance snapshot** | `balanceOf(DIR)` per address at Sepolia block **T**. | Easy to verify on explorer; includes secondary transfers / noise. |
| **C — Claimed-only** | Sum amounts users **already claimed** on Sepolia (events / subgraph / indexer). | Conservative; under-credits people who earned but didn’t claim. |
| **D — Formula + cap** | e.g. **A × 0.8** or per-user cap; anti-Sybil for cheap testnet. | Common when testnet was gameable. |

Document the chosen rule in **one public paragraph** before snapshot (“Beta credits = sum of published epoch allocations through epoch X / cutoff date Y.”).

### 4.2 Build the genesis credit epoch

1. **Cutoff:** Last beta epoch id or calendar date included in the sum.
2. **Export:** Script or manual merge → table `(beneficiary_address, total_wei)` deduped and validated (`checksummed` addresses, uint256 strings).
3. **Merkle:** Build **one** `epoch-*.json` with **`chainId: 8453`**, mainnet **`tokenAddress` / `emissionsAddress`**, and **`allocations: [{ beneficiary, amountWei }]`** matching the tree builder you use today (`build-epoch.cjs` or a thin sibling script that skips scoring and **only** ingests your export).
4. **Pool check:** Mainnet **`EmissionsController`** balance **≥** `sum(amountWei)` before `registerRoot`.
5. **`registerRoot`** on **mainnet** with deployer/multisig.
6. **`POST /v1/admin/rewards-epochs`** with the same body shape as [current-environment.md § M3](current-environment.md#m3-epoch--claim-runbook).
7. **Comms:** “First mainnet Rewards = your **beta credit**; later epochs = mainnet activity only.”

**Double-claim:** Each `(root, leaf)` can only be claimed once on-chain. Beta credits should be **one consolidated allocation per beneficiary** in that genesis epoch (or multiple epochs if you **intentionally** split roots—usually unnecessary).

**Address mismatches:** Credits key off **0x** beneficiaries. If a user changes **payout** after snapshot, **policy** decides (honor snapshot address vs support ticket)—state that upfront.

### 4.3 Risk and compliance (short)

- **Testnet gaming:** consider caps, **D** above, or manual review for top buckets.
- **Promising amounts:** get **legal review** before publishing guaranteed mainnet credits to strangers.
- **Privacy:** exported tables are **addresses + amounts**—handle like sensitive ops data.

---

## 5. Phased roadmap (checklist)

### Phase 0 — Policy and snapshot

- [ ] Write **one-paragraph** beta credit rule (§4.1).
- [ ] Communicate **snapshot cutoff** and **address finalization** deadline.
- [ ] **Legal** sign-off if credits are marketed as **real** asset value.
- [ ] **Multisig** plan for `EmissionsController` owner on mainnet (recommended before large pool).
- [ ] **Treasury:** mainnet mint/genesis split; ensure **controller** can absorb **beta sum + future epochs**.

### Phase 1 — Mainnet contracts

- [ ] Deploy token + emissions on Base mainnet; record `deployments/base.json` (or your Hardhat network name).
- [ ] Fund controller: **beta credit total + headroom** for post-beta epochs.
- [ ] Optional: contract verification on explorer.

### Phase 2 — Apps & infra

- [ ] Netlify (or host): `VITE_CHAIN_ID=8453`, mainnet RPC, `VITE_TOKEN_ADDRESS`, `VITE_EMISSIONS_ADDRESS`, `VITE_RELAY_URL`.
- [ ] Fly: mainnet RPC, `EMISSIONS_ADDRESS`, funded `RELAYER_PRIVATE_KEY`, `INDEXER_SECRET`, etc.
- [ ] `/health` → `sponsoredClaim: true`; alerts on relayer ETH.

### Phase 3 — Genesis credit epoch (beta)

- [ ] Produce **`epoch-beta-credit-*.json`** from §4.2.
- [ ] `registerRoot` on mainnet; `POST` epoch to relay; smoke-test one claim.

### Phase 4 — Ongoing mainnet epochs

- [ ] Same runbook as [M3 in current-environment.md](current-environment.md#m3-epoch--claim-runbook) with **chainId 8453** and mainnet deployments.

### Phase 5 — Sustainability

- [ ] Model relayer gas vs revenue / subsidy caps; hybrid gasless if needed.

---

## 6. Myths vs facts

| Myth | Fact |
|------|------|
| “We only change config.” | **New chain = new contracts.** Sepolia state does not port unless you **execute** §4. |
| “Beta DIR becomes real automatically.” | **Real mainnet DIR** requires mainnet **deploy + funding + claims**. Beta **amounts** carry over only if **in your published mainnet allocations**. |
| “Treasury logic changes on mainnet.” | **Same Solidity rules**; you choose **amounts** (mint, pool, transfers) at launch. |

---

## 7. Related docs

- [`current-environment.md`](current-environment.md) — **Live testnet** URLs, M3 runbook, gasless setup.
- [`first-epoch-cookbook.md`](first-epoch-cookbook.md) — First epoch steps (testnet-oriented; pattern matches mainnet).
- [`STATUS-AND-ROADMAP.md`](../STATUS-AND-ROADMAP.md) — Product narrative and doc index.
- [`contracts/scripts/deploy.ts`](../../contracts/scripts/deploy.ts) — Genesis economics reference.

---

**Summary:** **Same claim system on mainnet.** **Beta preservation** = **frozen snapshot → one mainnet Merkle epoch (genesis credit) → users claim as today.** Sepolia tokens stay on Sepolia; mainnet value starts with **your** deploy, **your** pool funding, and **your** published roots.
