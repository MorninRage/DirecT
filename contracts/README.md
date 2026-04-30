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

## Merkle claims

Leaves are `[beneficiary, amount]` pairs using OpenZeppelin `StandardMerkleTree` (`@openzeppelin/merkle-tree` in tests). The on-chain leaf hash matches OZ Solidity:

`keccak256(bytes.concat(keccak256(abi.encode(addr, amount))))`.

## Foundry (optional)

If you use Foundry locally, `foundry.toml` is provided. Run `forge install` for dependencies; Hardhat is the default toolchain in this repo because it works cleanly on Windows without `forge`.
