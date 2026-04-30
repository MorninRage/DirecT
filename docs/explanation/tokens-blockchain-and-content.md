# How DirecT tokens, the blockchain, and content creation fit together

This document explains—in depth, with analogies and examples—how **DIR** (the token), **blockchains**, and **content** relate in the DirecT design. It complements the formal specs in `[protocol/README.md](../protocol/README.md)`, `[economics/tokenomics.md](../economics/tokenomics.md)`, and `[architecture/settlement-decision.md](../architecture/settlement-decision.md)`.

> **Plain disclaimer:** This is a technical and economic *design* description. It is **not** investment advice, a promise of returns, or a guarantee that any token will have market value. Markets, regulation, and product traction are external to this document.

---

## 1. The core idea in one paragraph

DirecT separates **three jobs**:

1. **Create and spread content** (posts, media, reactions) cheaply and quickly—mostly **off-chain** or in app/relay infrastructure.
2. **Measure engagement** in a way that can be **audited** (signatures, replay rules, indexer policy)—so rewards are not “trust me, bro.”
3. **Settle money and rules on-chain** as an **ERC-20 on an L2**—so ownership of DIR, emission schedules, claims, treasury, and governance live where cryptography and smart contracts apply.

**Content does not “become” the token.** Content produces **signals**. Those signals **route** how **new DIR emissions** are allocated. **Trading value** of DIR is a **separate** question: liquidity, utility, belief, and risk.

**If your question is “where do the *first* DIR come from?”** — that is **not** from posting. See **§2 (Genesis vs posting)** below.

---

## 2. Where do the initial tokens come from? (Genesis vs posting)

This section answers the most common confusion: **nobody “mines” the first DIR by posting.** Posting only helps **route** later payouts from a **pre-planned bucket** called **community emissions**.

### 2.1 Short answer

- **Initial DIR** = units defined when the token **launches on-chain** ( **genesis** ): a **total supply** is chosen (example: **1,000,000,000 DIR** in `[tokenomics.md](../economics/tokenomics.md)`), and that total is **split into allocations** (treasury, team, community program, liquidity, early users).
- **Mechanically**, those units are created by the **ERC-20 smart contract** ( **mint** at deploy ) and/or released over time by **authorized contracts** (emissions controller, vesting vaults). Exact bytecode is implementation-specific—see `contracts/` when wired for mainnet.
- **Posting** affects **who gets a share of the weekly (or epoch) creator pool** R_e, where R_e is a **slice of the community-emissions budget**, not “coins appearing from thin air” because you uploaded a video.

> **Testnet today:** A **Base Sepolia** deployment is **live** (treasury mint + rewards pool on `EmissionsController`). Exact addresses and hosting URLs are summarized in [`../deploy/current-environment.md`](../deploy/current-environment.md). Creator **claims** still require Merkle roots + UI or external tooling—see MVP **M3**.

**Analogy — festival tickets:** The venue **prints a fixed number of tickets** before the show. Some go to **staff**, some to **sponsors**, some are held for **door prizes**, some for **fans** to buy. **Winning a guitar solo contest** does not print new cardboard; it decides who receives tickets **from the prize stash**.

### 2.2 Terms you need for “where coins come from”


| Term                              | Plain definition                                                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Genesis**                       | “Day one” of the on-chain ledger for DIR: **total supply** and **allocation plan** are fixed in code or in multisig-held vaults.                                                                                       |
| **TGE (token generation event)**  | The **public** moment the project treats the token as **live** for trading / transfers per their playbook—often paired with liquidity listings. May coincide with deployment or follow after audits.                   |
| **Total supply**                  | The **maximum** (or policy-defined) count of **whole DIR units** the economics doc targets (example **1e9 tokens**, each divisibile into **wei**-scale subunits like any ERC-20).                                      |
| **Wei (base unit)**               | Smallest step the contract counts ( **10^18** subunits per 1 DIR in the usual ERC-20 pattern). When we write “1 DIR” we mean **1 × 10^18** base units unless noted otherwise.                                          |
| **Mint**                          | Instruction that **increases** total tracked supply and credits an address. **Alternative pattern:** mint **100% once** to treasury contracts, then only **transfer**—no further mints until governance changes rules. |
| **Allocation / bucket**           | A **labeled slice** of total supply—e.g. “25% treasury.” It is **counting**, not automatic **USD value**.                                                                                                              |
| **Vesting**                       | **Time-locked** allocations (common for team): tokens are **yours on paper** but the contract **only releases** them month by month—like **salary drips**, not a lump-sum bag on day one.                              |
| **Circulating supply**            | **Rough** measure: tokens **likely tradable** now (excludes **locked**, **unvested**, **not yet dripped** program budgets). Data vendors define this slightly differently.                                             |
| **Float**                         | Tokens **available** to trade in practice (related to circulating + how much is actually on order books—not identical to “total”).                                                                                     |
| **Treasury**                      | On-chain (or governed) **war chest** of DIR for audits, grants, incentives—spent via **governance**, not by one engineer’s whim in production designs.                                                                 |
| **Emissions / emission schedule** | **Time plan** for releasing DIR from the **community** (and possibly other) buckets—e.g. “higher drip years 0–2, slower years 6–10” per `[tokenomics.md](../economics/tokenomics.md)`.                                 |
| **Epoch**                         | One **accounting period** (e.g. one week) where a **pool** R_e is paid out to creators by **score**.                                                                                                                   |
| **Epoch pool R_e**                | The slice of emissions budget **for that epoch only** that gets split among eligible posts.                                                                                                                            |
| **Sybil**                         | Many **fake identities** pretending to be engagement; economics uses **weights, caps, quality discounts**, and policy to limit gaming.                                                                                 |


### 2.3 The genesis pie (from `tokenomics.md`)

These percentages are **shares of the total genesis supply** (same 1B DIR example):


| Bucket                      | % of total | Plain English                                                                              |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| **Community emissions**     | 40%        | **Long-run creator + ecosystem budget**—released over **10 years**, not dumped on day one. |
| **Team & contributors**     | 20%        | **Builders’ allocation**, typically **vested** (e.g. 48-month linear in the doc).          |
| **Treasury / DAO**          | 25%        | **Protocol-owned** stockpile governed by votes.                                            |
| **Liquidity & listings**    | 10%        | **DEX / CEX / MM**—so there is somewhere to trade without absurd slippage.                 |
| **Early users / bootstrap** | 5%         | **Airdrops / retro** with anti-Sybil design.                                               |


**Toy arithmetic** ( **1,000,000,000 DIR** total):


| Bucket                      | DIR units (example) |
| --------------------------- | ------------------- |
| Community emissions program | 400,000,000         |
| Team (vesting)              | 200,000,000         |
| Treasury                    | 250,000,000         |
| Liquidity                   | 100,000,000         |
| Early users                 | 50,000,000          |


Those numbers are **inventory labels**, not “market cap in dollars.”

### 2.4 How that connects to **R_e** (weekly creator pool)

1. **400M DIR** (in the toy model) is **earmarked** for community emissions over a decade.
2. The **emissions curve** decides **how fast** that year’s tranche enters circulation.
3. Each **epoch**, a **slice** becomes **R_e**.
4. **Creators earn fractions of R_e** according to the **score** formula—not by inventing new supply, but by **routing** that slice.

**Analogy — payroll:** Payroll does not **print new dollars** every Friday; **HR moves money** from the **salary budget** to employees. Here, **protocol code + governance** play HR.

### 2.5 What posting does **not** do

- Does **not** create the **team** or **treasury** pools.  
- Does **not** by itself increase **liquidity** on a DEX.  
- Does **not** guarantee **price** or **USD** value.

### 2.6 Optional inflation **tail**

`[tokenomics.md](../economics/tokenomics.md)` allows a **small, governance-capped** ongoing inflation for **security budget**—**different** from “every like mints a coin.” If enabled, that too is a **rule change**, not a content side-effect.

### 2.7 Testnet honesty

`[mvp-scope.md](../mvp-scope.md)`: on **testnet**, operators may **mint play money** to test flows. That is **not** the mainnet genesis story—do not confuse **faucet behavior** with **production allocation**.

---

## 3. Mental model: stadium, scoreboard, and central bank

**Analogy — a football league:**


| Layer                   | Football                                     | DirecT                                                               |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| **The game**            | Players run plays; fans cheer                | Users post; others view, react, comment, share                       |
| **The scoreboard**      | Official stats: yards, TDs, attendance       | Relay/indexer: per-post **metrics** derived from **signed events**   |
| **Prizes / salary cap** | League pays teams from TV + sponsorship pool | **Emission pool** R_e pays **creators** per **epoch** by **formula** |
| **Cash in your pocket** | dollars in a bank account                    | **DIR balance** on-chain (L2)                                        |


The **game** is fun and chaotic. The **scoreboard** is supposed to be **consistent** enough that payouts aren’t random. The **bank** is where “who owns what” is **final**—that’s the blockchain for DIR.

**Key insight:** The league paying you for points doesn’t automatically make dollars valuable globally. It pays you in **an asset** whose **market price** depends on many other forces (sponsors, fans, FX markets…). Same for DIR.

---

## 4. What runs where (content vs chain)

### 4.1 Content and engagement events (mostly *not* full post bodies on L1)

In v0, a **post** is content (text, media pointers) wrapped in a **canonical JSON** body and submitted inside a **signed envelope** (EIP-712). See `[protocol/README.md](../protocol/README.md)`.

Think of each publish as:

> “Here is a precise digest of what I said; **my wallet signature** proves I authored this payload at this time.”

**Analogy:** A **notarized letter**. The notary stamp is the signature; the letter might be stored in a filing cabinet (relay/media storage), but the **proof of who sent it** is cryptographic.

**Why not put every word on Ethereum L1?**

- Cost and throughput: social feeds generate huge volume.
- UX: waiting for L1 confirmation per comment would ruin the product.

So DirecT is **L2-first** for the token (`[settlement-decision.md](../architecture/settlement-decision.md)`) while the **data plane** can be relays, optional PDS, etc.

### 4.2 DIR and rules (on-chain)

**DIR** as an **ERC-20** means:

- Balances are **ledger entries** on the L2.
- Transfers, DEX pools, staking contracts, and governance modules use **standard tooling**.

**Analogy:** DIR is **chips at a casino** that can leave the casino only through the **cashier** (bridges, CEX, etc.). The “casino ledger” is the chain; **house rules** (emissions, caps) are **smart contracts + governance**.

---

## 5. End-to-end example: one post, three reactions, one share

### 5.1 Cast

- **Alice** (`0xAAA…`) writes a video post. Her app builds a body:

```json
{
  "type": "post",
  "schema": "direct.post.v1",
  "text": "Demo: my first DirecT clip",
  "media": [{ "cid": "0xabc…", "mime": "video/mp4", "size": 2345678 }],
  "reply_to": null,
  "created_at": "2026-04-29T12:00:00Z",
  "direct_handle": "alice"
}
```

(If `direct_handle` is present, the relay checks the signer is **linked** to that profile—see app docs; this prevents handle spoofing.)

- Alice’s wallet signs **EIP-712** over a hash of that body + header fields. The relay stores the envelope and assigns `**eid`** = content id for that post.

### 5.2 Engagement

- **Bob** reacts `empathy`; **Carol** comments “Great take”; **Dave** reshares.

Each of these is **its own signed child event** with `reply_to` = Alice’s post `eid`. The relay increments **metrics** on Alice’s post: reactions, comments, shares—see `[protocol/README.md](../protocol/README.md)` reaction/share types.

**Analogy:** Alice hung a painting (`post`). Bob, Carol, and Dave each put **stickers on the comment book** next to the painting—every sticker is **signed**, so you can’t pretend Carol said something she didn’t.

### 5.3 Metrics → score (toy numbers)

Formal weights live in `[tokenomics.md](../economics/tokenomics.md)`. For **intuition**, suppose after anti-abuse filtering Alice’s **verified** engagement for an epoch is:


| Signal              | Count | Weight (illustrative) | Contribution (log-based)         |
| ------------------- | ----- | --------------------- | -------------------------------- |
| Views V             | 1000  | w_V = 1.0             | \log(1+1000) \approx 6.91        |
| Likes / reactions L | 50    | w_L = 2.0             | 2 \cdot \log(1+50) \approx 7.84  |
| Comments C          | 12    | w_C = 3.0             | 3 \cdot \log(1+12) \approx 7.64  |
| Shares S            | 8     | w_S = 2.5             | 2.5 \cdot \log(1+8) \approx 5.49 |


The real formula sums weighted **logs** (diminishing returns so infinite bot views don’t linearly dominate). A **quality factor** Q_c \in (0,1] can slash spammy posts.

**Alice’s raw score** (illustrative only):

\text{score}_c \approx 6.91 + 7.84 + 7.64 + 5.49 = 27.88

Multiply by Q_c if the policy discounts her piece.

### 5.4 Splitting the epoch pool

Suppose the **epoch reward pool** is **R_e = 1{,}000{,}000** DIR **wei**-scale units (toy integer, not a price).

All **eligible** posts in the epoch have scores. Alice’s payout **share** is:

\text{payout}*c = R_e \cdot \frac{\text{score}c \cdot Q_c}{\sum{c'} \text{score}*{c'} \cdot Q_{c'}}

**Example:** Only Alice and **Yuki** are eligible. Yuki’s adjusted score is **42.0**; Alice’s is **27.9**. Total = **69.9**.

- Alice: 1{,}000{,}000 \times \frac{27.9}{69.9} \approx 399{,}140 units  
- Yuki: 1{,}000{,}000 \times \frac{42.0}{69.9} \approx 600{,}860 units

**Per-creator caps** (e.g. max 5% of R_e to one creator across all their posts) stop one superstar from vacuuming the whole pool—see `[tokenomics.md](../economics/tokenomics.md)`.

### 5.5 Where the money comes from

Those **units** are not invented by the post; they come from the **emissions schedule** (community bucket over years) minus whatever governance locks for other programs.

**Analogy:** **Columbia Records** doesn’t print a new dollar bill every time a song streams; it pays royalties out of **revenue and contracts**. Here, “revenue” at maturity might include **fees**, **treasury**, **ecosystem deals**—but **early epochs** are often **emission-funded**, which is why **sell pressure vs demand** is a first-principles concern.

---

## 6. “Tied to content” vs “valuable token”: two different claims

### 6.1 Tied to content (allocation)

**True in design:** *who receives newly emitted DIR* (or claim rights) can be **indexed to measurable creative outcomes** under transparent rules.

**Analogy:** A **YouTube Partner Program** pays creators from ad pools using watch time and policy. The **paying rule** is tied to content performance; **YouTube’s stock price** is not the same object.

### 6.2 Valuable in the market (price)

**Not guaranteed by the link to content.** Market price aggregates:

1. **Utility demand** — need DIR to pay for boosts, tips, QoS, staking, governance (`[tokenomics.md](../economics/tokenomics.md)` sinks).
2. **Liquidity** — two-way markets (`[tokenomics.md](../economics/tokenomics.md)` liquidity bucket).
3. **Expectations** — growth, narrative, risk premia.
4. **Speculation** — can dominate short term.

**Analogy:** **Airline miles** tie earning to flying; miles have *some* “value” in redemptions, but you wouldn’t confuse their **redemption table** with **USD inflation**.

---

## 7. Why signatures matter (honest engagement graph)

Unsigned impressions are easy to fake at scale. DirecT’s v0 direction is:

- **Reactions, comments, shares** as **signed events** attached to a parent `eid`.

**Analogy:** Yelp reviews would be more trustworthy if every review had a **verifiable ID** and **cost** (even a small fee or stake) and couldn’t be duplicated endlessly for free.

**Reality check:** Nothing stops a rich attacker from buying many keys; hence **weights**, **caps**, **quality discounts**, and long term **Sybil resistance** (staking, graph analysis, human proof—see `[security/threat-model.md](../security/threat-model.md)` as your repo evolves).

---

## 8. MVP vs later production

`[mvp-scope.md](../mvp-scope.md)` states the near-term loop:

**Wallet → relay post/read → metrics v0 → testnet DIR payouts (Merkle / allowlist style).**

So in the **current repo trajectory**, you may see:

- Metrics on the **relay** (counts).
- Payouts on **testnet** with simplified **oracle/governance-lite**.

**Do not assume** mainnet legal, tax, or securities characterization is settled—your repo already points at `[legal/counsel-checklist.md](../legal/counsel-checklist.md)`.

---

## 9. Governance as the “rulebook update layer”

Parameters—weights w_V, w_L, w_C, w_S, caps, epoch length, fee switches—are meant to be **governable** within bounds (`[governance/governance.md](../governance/governance.md)`).

**Analogy:** The **NFL changes rules** (catch definition, overtime) through ownership votes. Holders of DIR (according to your charter) are closer to **voting stakeholders** than to “users who once posted a meme.”

---

## 10. Glossary (expanded)


| Term                           | Meaning                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1**                         | Base Ethereum chain: highest security, higher fees; DIR is not meant to thrash here for every social action—`[settlement-decision.md](../architecture/settlement-decision.md)`. |
| **L2**                         | Rollup / scaling chain that settles to L1: cheaper txs; **DIR lives here** in the v0 plan.                                                                                      |
| **ERC-20**                     | Standard interface for **fungible** tokens (balances, `transfer`, `approve`). DIR is an ERC-20 on the chosen L2.                                                                |
| **Smart contract**             | On-chain program: **rules without a single server**. Token supply logic, vesting, governance timelocks deploy here.                                                             |
| **Wallet / address**           | **0x…** identity that **signs** messages and **holds** token balances. Can be MetaMask, embedded key, etc.                                                                      |
| **Genesis**                    | First on-chain state of the token: **total cap** + **who holds which bucket** (see §2).                                                                                         |
| **TGE**                        | Token generation event: public “go live” for trading / transfers per project plan.                                                                                              |
| **Mint**                       | Create token units on-chain and credit an address (or mint 100% once then only move—both industry patterns).                                                                    |
| **Burn**                       | Destroy token units (reduce supply) when implemented—optional for fees in `[tokenomics.md](../economics/tokenomics.md)`.                                                        |
| **Allocation / bucket**        | Labeled % of **total supply** (treasury, team, …)—a **budget line**, not cash-in-hand.                                                                                          |
| **Vesting**                    | Time-based **unlock** of an allocation (linear, cliff, etc.).                                                                                                                   |
| **Treasury**                   | Protocol-controlled DIR (and maybe other assets) spent via **governance**.                                                                                                      |
| **Emissions**                  | Planned **release** of DIR from long-term program budgets (especially community 40%).                                                                                           |
| **Epoch**                      | Payout window (e.g. one week); one **R_e** per epoch in the design doc.                                                                                                         |
| **R_e / epoch pool**           | Amount of DIR available **this epoch** for creator splits.                                                                                                                      |
| **Relay**                      | HTTP service that ingests **signed events** and serves feeds/metrics—`[protocol/README.md](../protocol/README.md)`.                                                             |
| **eid**                        | **Event id**: hash-like id for a signed envelope (post, comment, reaction, …).                                                                                                  |
| **Score**                      | Engagement-derived number used to split **R_e** among posts—`[tokenomics.md](../economics/tokenomics.md)`.                                                                      |
| **Sink**                       | **Demand** use that removes DIR from active trading (buy-backs to treasury, stake locks, optional burns, fees).                                                                 |
| **Float / circulating**        | **Tradable-ish** supply now; excludes much locked inventory—definitions vary by data provider.                                                                                  |
| **Sybil**                      | Fake-many-users attack; mitigated by policy, caps, weights, future staking / identity.                                                                                          |
| **Governance**                 | Token-holder (or charter-defined) **votes** to change parameters—`[governance/governance.md](../governance/governance.md)`.                                                     |
| **Oracle / finality (payout)** | In production, **who commits** engagement numbers on-chain before R_e pays—MVP may use simplified allowlists / Merkle proofs per `[mvp-scope.md](../mvp-scope.md)`.             |
| **DEX**                        | Decentralized exchange; **liquidity bucket** seeds pools so people can swap DIR vs e.g. ETH.                                                                                    |
| **CEX**                        | Centralized exchange listing—optional path for fiat ramps.                                                                                                                      |
| **Bridge**                     | Moves assets between chains—relevant if DIR or users move L1↔L2.                                                                                                                |
| **Direct_handle**              | Profile `@handle` attached to a signed post when the relay verifies **wallet linkage**—not the same as “minting DIR.”                                                           |


---

## 11. Suggested reading order

1. This document — read **§2** first if “where do initial tokens come from?” is unclear.
2. `[protocol/README.md](../protocol/README.md)` — exact payloads and APIs.
3. `[economics/tokenomics.md](../economics/tokenomics.md)` — supply, formula, parameters.
4. `[governance/governance.md](../governance/governance.md)` — who can change what.
5. `[security/threat-model.md](../security/threat-model.md)` — what attackers optimize for.

---

## 12. Changelog


| Date       | Author        | Note                                                                                  |
| ---------- | ------------- | ------------------------------------------------------------------------------------- |
| 2026-04-29 | Documentation | Added §2 genesis / initial supply, expanded glossary, renumbered sections.            |
| 2026-04-29 | Documentation | Initial long-form explainer with analogies and toy examples aligned to repo v0 specs. |
