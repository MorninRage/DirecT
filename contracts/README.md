# DirecT contracts (Solidity)

**Stack:** Hardhat + OpenZeppelin 5.x. Solidity **0.8.26**, EVM **Cancun** (required for OZ `mcopy`).

## Contracts

| Contract | Role |
|----------|------|
| `DirecTToken` | **DIR** — ERC-20 with votes, permit, and **minter** role. **Fixed cap:** `MAX_SUPPLY` = **1e9 tokens** (1,000,000,000 × 10^18 wei). |
| `EmissionsController` | Registers **Merkle roots**; `claim` / `payout` **transfer** DIR from the contract’s balance (fund the contract after genesis; no mint in claim). |

## Genesis (deploy script)

`scripts/deploy.ts` mints **1B DIR** to the deployer (treasury), deploys `EmissionsController`, and transfers **10M DIR** into the controller as an MVP rewards pool. Adjust the seed amount in the script as needed.

## Setup

```bash
cd contracts
npm install
npx hardhat test
```

## Deploy (example)

### Agent / CI (no browser faucet)

Coinbase **Developer Platform** can fund Base Sepolia ETH **via API** so scripts and agents do not use browser faucets.

1. One-time: create **API Key ID**, **API Key Secret**, and **Wallet Secret** at [CDP API keys](https://portal.cdp.coinbase.com/access/api) (free tier).
2. Add to `contracts/.env`: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET` (see `.env.example`).
3. From `contracts/`: `npm run ship:online` — this runs CDP faucet (if keys present), deploy, Netlify env sync, and production deploy.

Or fund only: `npm run fund:cdp`, then deploy as below.

### Manual / default

```bash
cd contracts
npm install

# 1) Create contracts/.env with a NEW key (never printed — only the address is shown). Fund that address on Base Sepolia.
npm run gen:deployer

# 2) Deploy token + emissions (reads DEPLOYER_PRIVATE_KEY from .env via dotenv)
npm run deploy:base

# Writes deployments/baseSepolia.json (gitignored) — addresses only, no private key.

# 3) Push addresses into Netlify production build env (from repo root; netlify CLI logged in)
cd ..
npm run netlify:sync-token --prefix contracts

# 4) Trigger a new Netlify production deploy so Vite bakes in VITE_TOKEN_*.

# Local / CI simulation (no chain)
npm run deploy:local   # hardhat in-memory; writes deployments/hardhat.json
```

## Deployment record (where addresses live)

- **`deployments/baseSepolia.json`** — written by `deploy:base`; **gitignored**; source of truth on your machine after deploy.
- **[`docs/deploy/current-environment.md`](../docs/deploy/current-environment.md)** — doc snapshot of URLs + contract table (update when you redeploy).

## Merkle claims

Leaves are `[beneficiary, amount]` pairs using OpenZeppelin `StandardMerkleTree` (`@openzeppelin/merkle-tree` in tests). The on-chain leaf hash matches OZ Solidity:

`keccak256(bytes.concat(keccak256(abi.encode(addr, amount))))`.

## Foundry (optional)

If you use Foundry locally, `foundry.toml` is provided. Run `forge install` for dependencies; Hardhat is the default toolchain in this repo because it works cleanly on Windows without `forge`.
