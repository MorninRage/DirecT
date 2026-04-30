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
# Local / CI (no on-chain deploy)
npx hardhat run scripts/deploy.ts --network hardhat

# Base Sepolia (set funded key)
DEPLOYER_PRIVATE_KEY=0x... npx hardhat run scripts/deploy.ts --network baseSepolia
```

Prints addresses for `VITE_TOKEN_ADDRESS` and `VITE_EMISSIONS_ADDRESS` for the web app.

## Merkle claims

Leaves are `[beneficiary, amount]` pairs using OpenZeppelin `StandardMerkleTree` (`@openzeppelin/merkle-tree` in tests). The on-chain leaf hash matches OZ Solidity:

`keccak256(bytes.concat(keccak256(abi.encode(addr, amount))))`.

## Foundry (optional)

If you use Foundry locally, `foundry.toml` is provided. Run `forge install` for dependencies; Hardhat is the default toolchain in this repo because it works cleanly on Windows without `forge`.
