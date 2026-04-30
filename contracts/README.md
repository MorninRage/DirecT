# DirecT contracts (Solidity)

**Stack:** Hardhat + OpenZeppelin 5.x. Solidity **0.8.26**, EVM **Cancun** (required for OZ `mcopy`).

## Contracts

| Contract | Role |
|----------|------|
| `DirecTToken` | DIR — ERC-20 with **votes**, **permit**, **multiminter** role for emissions. |
| `EmissionsController` | Registers **Merkle roots** for epoch payouts; `claim` mints DIR; `payout` owner shortcut for testnets. |

## Setup

```bash
cd contracts
npm install
npx hardhat test
```

## Deploy (example)

```bash
npx hardhat run scripts/deploy.ts --network <your-network>
```

Set `EmissionsController` as a minter via constructor sequence in script (already done).

## Foundry (optional)

If you use Foundry locally, `foundry.toml` is provided. Run `forge install` for dependencies; Hardhat is the default toolchain in this repo because it works cleanly on Windows without `forge`.

## Merkle claims

Leaves are `[beneficiary, amount]` pairs using OpenZeppelin `StandardMerkleTree` (`@openzeppelin/merkle-tree` in tests). The on-chain leaf hash matches OZ Solidity:

`keccak256(bytes.concat(keccak256(abi.encode(addr, amount))))`.
