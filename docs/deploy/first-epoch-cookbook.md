# First epoch cookbook (testnet)

This page answers: **what exactly do I run?** and **do normal users need server access?**

---

## Who does what?

| Role | What they do | Need Fly / deployer key? |
|------|----------------|---------------------------|
| **You (operator / treasury)** | Export relay data, build the Merkle epoch, **`registerRoot`** on-chain, **`POST`** epoch to relay | **Yes** — indexer secret, deployer wallet, maybe SSH/Fly only for setting secrets |
| **Creators (any user)** | Sign up, link a wallet (or set payout address), post, then open **Rewards** and click **Claim** | **No** — they only use the website |

**Users are never supposed to run Fly commands or touch `INDEXER_SECRET`.** They only need a browser, their profile, and a wallet that appears in the published **`allocations`** list for that epoch.

The relay is simply the **public bulletin board** that stores “epoch 3: here is the Merkle root + who gets how much” after **you** publish it.

---

## What “first epoch” means

1. There is real activity on the relay (posts with **`direct_handle`**, engagement metrics, accounts with **`linkedWallets`** or **`payoutAddress`**).
2. You run the tooling once to produce **`allocations`** + **`root`**, register **`root`** on **`EmissionsController`**, then **tell the relay** via admin API.
3. After that, **`/v1/rewards/epochs/latest`** is non-null and the web app shows the epoch so people can **claim**.

---

## Prerequisites (check before you start)

1. **Relay URL** — e.g. `https://morninrage-direct-relay.fly.dev` (no trailing slash).
2. **`INDEXER_SECRET` on Fly** — protects snapshot + admin routes. Set once if you haven’t:

   ```bash
   fly secrets set INDEXER_SECRET="paste-a-long-random-string" -a morninrage-direct-relay
   ```

   Use the **same** value locally when you call `curl` (see below). **Never commit it to Git.**

3. **`contracts/.env`** — `DEPLOYER_PRIVATE_KEY=` for the wallet that **owns** **`EmissionsController`** (the one that can call **`registerRoot`**). From `contracts/`:

   ```
   npm run compile
   ```

4. **`deployments/baseSepolia.json`** (after deploy) — has **`EmissionsController`** address, or copy addresses from [current-environment.md](current-environment.md).

5. **Emissions pool** — controller contract must hold enough DIR for the sum of **`allocations`** (deploy script seeds **10M DIR** on testnet by default).

---

## Step 1 — Download a snapshot from the relay

Replace `RELAY` and use your secret:

**macOS / Linux / Git Bash**

```bash
export RELAY="https://morninrage-direct-relay.fly.dev"
export INDEXER_SECRET="your-fly-secret"

curl -fsS -H "x-indexer-secret: $INDEXER_SECRET" \
  "$RELAY/v1/indexer/snapshot" -o snapshot.json
```

**PowerShell (Windows)**

```powershell
$RELAY = "https://morninrage-direct-relay.fly.dev"
$INDEXER_SECRET = "your-fly-secret"
curl.exe -fsS -H "x-indexer-secret: $INDEXER_SECRET" `
  "$RELAY/v1/indexer/snapshot" -o snapshot.json
```

If this fails with **401**, the secret header doesn’t match what Fly has. If **`accounts`** are empty or posts have no **`direct_handle`**, your tree may end up with **no allocations** — fix data first.

---

## Step 2 — Prepare a policy file

From the repo:

```bash
cp contracts/scripts/example-epoch-policy.json contracts/scripts/my-epoch-1.json
```

Edit **`my-epoch-1.json`**:

- **`epochId`** — e.g. `"epoch-2026-04-30"` (becomes the epoch **`id`** on the relay).
- **`chainId`** — **`84532`** (Base Sepolia).
- **`weights` / `perUserCapWei`** — tune as you like.
- **`tokenAddress` / `emissionsAddress`** — must match your deployed contracts (the example file may already match the doc snapshot).

You must choose how much DIR this epoch pays: either **`--pool-wei`** or **`--fetch-pool`** (see next step). **`--fetch-pool`** uses **current DIR balance** of the emissions contract (capped supply for the epoch).

---

## Step 3 — Build the Merkle epoch JSON

From repository root, create an **`epochs`** folder if needed:

```bash
mkdir -p epochs
```

From **`contracts/`** (adjust paths if your `snapshot.json` lives elsewhere):

```bash
cd contracts

# Option A — cap from on-chain balance (needs RPC)
node scripts/build-epoch.cjs \
  --snapshot ../snapshot.json \
  --policy scripts/my-epoch-1.json \
  --out ../epochs \
  --fetch-pool \
  --rpc-url "https://sepolia.base.org" \
  --token 0xYOUR_DIR_TOKEN \
  --emissions 0xYOUR_EMISSIONS_CONTROLLER

# Option B — explicit max DIR for this epoch (wei string)
# node scripts/build-epoch.cjs \
#   --snapshot ../snapshot.json \
#   --policy scripts/my-epoch-1.json \
#   --out ../epochs \
#   --pool-wei 1000000000000000000000
```

You should get **`../epochs/epoch-<your-epochId>.json`** with **`root`**, **`allocations`**, **`report`** (skipped handles, etc.).

- If **`allocations` is `[]`**, open **`report`** and fix: link wallets, **`direct_handle`** on posts, engagement.

---

## Step 4 — Register the root on-chain

Still with deployer key in **`contracts/.env`**:

```bash
cd contracts
npm run epoch:register -- ../epochs/epoch-epoch-2026-04-30.json
```

(Use the **actual filename** from step 3.)  
This appends **`registerTxHash`** into the same JSON file.

---

## Step 5 — Publish the epoch to the relay (admin only)

The relay expects **`PublishedRewardEpoch`**: field **`id`**, not **`epochId`**. Easiest fix without **`jq`** — open the epoch JSON and ensure a top-level **`id`** matches **`epochId`**, and rename **`builtAtMs`** → **`publishedAtMs`** if you use the file literally.

**Minimal body shape:**

```json
{
  "id": "epoch-2026-04-30",
  "root": "0x…",
  "chainId": 84532,
  "publishedAtMs": 1714500000000,
  "registerTxHash": "0x…",
  "allocations": [
    { "beneficiary": "0x…", "amountWei": "1000000000000000000" }
  ]
}
```

**Node one-liner** (from repo root) to print a valid JSON body to copy or pipe:

```bash
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('epochs/epoch-epoch-2026-04-30.json','utf8'));const b={id:j.epochId,root:j.root,chainId:j.chainId,publishedAtMs:j.builtAtMs,allocations:j.allocations};if(j.registerTxHash)b.registerTxHash=j.registerTxHash;console.log(JSON.stringify(b));" > publish-body.json
```

**POST** (replace `RELAY` and secret):

```bash
curl -fsS -X POST "$RELAY/v1/admin/rewards-epochs" \
  -H "Content-Type: application/json" \
  -H "x-indexer-secret: $INDEXER_SECRET" \
  -d @publish-body.json
```

Expect **201** and **`{"ok":true}`**.

Verify:

```bash
curl -fsS "$RELAY/v1/rewards/epochs/latest"
```

You should see **`epoch": { ... }`**, not **`null`**.

---

## Step 6 — What creators do (no server access)

1. Open the live site (e.g. Netlify URL).
2. **Settings** → link the **same wallet** (or set **payout address**) that appears as **`beneficiary`** in **`allocations`**.
3. Connect that wallet in the header / **Wallet** dialog.
4. **Rewards** (`/claim`) → should show the epoch → **Claim** → approve tx on Base Sepolia.

They **never** run **`fly`** or **`build-epoch`**. If their wallet isn’t in the tree, they won’t see an amount — that’s a **policy / eligibility** outcome, not a bug.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Rewards always “no epoch” | Step 5 not done or wrong relay URL in `VITE_RELAY_URL` |
| Claim reverts “inactive root” | Step 4 not run or wrong **`root`** |
| Empty **`allocations`** | No beneficiaries resolved — link wallets / **`payoutAddress`**, posts need **`direct_handle`** and metrics |
| 401 on snapshot or admin | Wrong **`INDEXER_SECRET`** header |
| Underfunded claim | **`EmissionsController`** DIR balance \< amount |

---

## Related

- Full runbook + env tables: [current-environment.md](current-environment.md)  
- API details: [protocol/README.md](../protocol/README.md)  
- Product context: [STATUS-AND-ROADMAP.md](../STATUS-AND-ROADMAP.md)
