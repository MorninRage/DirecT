import { concat, encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/** Matches `EmissionsController.claim` leaf hashing (OpenZeppelin double keccak). */
export function merkleClaimLeaf(beneficiary: Address, amount: bigint): Hex {
  const inner = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [beneficiary, amount]),
  );
  return keccak256(concat([inner]));
}
