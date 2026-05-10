import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import {
  concat,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { AccountProfile } from "./accounts.js";
import { preferredMerkleBeneficiary } from "./rewardBeneficiary.js";
import type { PublishedRewardEpoch } from "./rewardsEpochs.js";

/** Matches EmissionsController leaf hashing. */
export function merkleClaimLeaf(beneficiary: Address, amount: bigint): Hex {
  const inner = keccak256(
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [beneficiary, amount]),
  );
  return keccak256(concat([inner]));
}

export const emissionsClaimAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "root", type: "bytes32" },
      { name: "beneficiary", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "proof", type: "bytes32[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimed",
    stateMutability: "view",
    inputs: [
      { name: "root", type: "bytes32" },
      { name: "leaf", type: "bytes32" },
    ],
    outputs: [{ type: "bool", name: "isClaimed" }],
  },
  {
    type: "function",
    name: "roots",
    stateMutability: "view",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [{ type: "bool", name: "active" }],
  },
] as const;

function allocationCandidateSet(profile: AccountProfile): Set<string> {
  const allow = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    try {
      allow.add(getAddress(t as `0x${string}`).toLowerCase());
    } catch {
      /* skip */
    }
  };
  add(profile.payoutAddress ?? null);
  for (const w of profile.linkedWallets ?? []) add(w);
  return allow;
}

export function matchingRewardAllocations(
  epoch: PublishedRewardEpoch,
  profile: AccountProfile,
): PublishedRewardEpoch["allocations"] {
  const allow = allocationCandidateSet(profile);
  return epoch.allocations.filter((a) => allow.has(a.beneficiary.toLowerCase()));
}

function buildTree(allocations: PublishedRewardEpoch["allocations"]) {
  const entries: [string, bigint][] = allocations.map((a) => [
    getAddress(a.beneficiary as `0x${string}`),
    BigInt(a.amountWei),
  ]);
  return StandardMerkleTree.of(entries, ["address", "uint256"]);
}

export function pickBeneficiaryForClaim(
  epoch: PublishedRewardEpoch,
  profile: AccountProfile,
  beneficiaryOverride: string | undefined,
): { beneficiary: Address; amount: bigint; proof: Hex[] } {
  const matches = matchingRewardAllocations(epoch, profile);
  if (matches.length === 0) throw new Error("not_eligible");

  let row = matches[0]!;
  if (beneficiaryOverride?.trim()) {
    const want = getAddress(beneficiaryOverride.trim() as `0x${string}`).toLowerCase();
    const found = matches.find((m) => m.beneficiary.toLowerCase() === want);
    if (!found) throw new Error("beneficiary_not_in_epoch_for_profile");
    row = found;
  } else {
    const pref = preferredMerkleBeneficiary(profile);
    if (pref) {
      const found = matches.find((m) => m.beneficiary.toLowerCase() === pref.toLowerCase());
      if (found) row = found;
    }
  }

  const tree = buildTree(epoch.allocations);
  const rootHex = tree.root as Hex;
  if (rootHex.toLowerCase() !== epoch.root.toLowerCase()) throw new Error("root_mismatch");

  const beneficiary = getAddress(row.beneficiary as `0x${string}`);
  const amount = BigInt(row.amountWei);
  const proof = tree.getProof([beneficiary, amount] as [string, bigint]) as Hex[];
  return { beneficiary, amount, proof };
}

export type SponsoredClaimConfig = {
  relayerPk: Hex;
  emissions: Address;
  rpcUrl: string;
  chain: Chain;
};

export function sponsoredClaimEnvDiagnostics(): {
  relayerKeyPresent: boolean;
  relayerKeyFormatOk: boolean;
  emissionsPresent: boolean;
  emissionsFormatOk: boolean;
} {
  const rawPk = process.env.RELAYER_PRIVATE_KEY?.trim();
  const rawEm = process.env.EMISSIONS_ADDRESS?.trim();
  return {
    relayerKeyPresent: Boolean(rawPk),
    relayerKeyFormatOk: Boolean(rawPk && /^0x[0-9a-fA-F]{64}$/.test(rawPk)),
    emissionsPresent: Boolean(rawEm),
    emissionsFormatOk: Boolean(rawEm && /^0x[0-9a-fA-F]{40}$/.test(rawEm)),
  };
}

export function loadSponsoredClaimConfig(): SponsoredClaimConfig | null {
  const rawPk = process.env.RELAYER_PRIVATE_KEY?.trim();
  const rawEm = process.env.EMISSIONS_ADDRESS?.trim();
  if (!rawPk || !/^0x[0-9a-fA-F]{64}$/.test(rawPk)) return null;
  if (!rawEm || !/^0x[0-9a-fA-F]{40}$/.test(rawEm)) return null;
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL?.trim() || "https://sepolia.base.org";
  const chainId = Number(process.env.CHAIN_ID ?? 84532);
  const chain = chainId === 84532 ? baseSepolia : { ...baseSepolia, id: chainId };
  return {
    relayerPk: rawPk as Hex,
    emissions: getAddress(rawEm as `0x${string}`),
    rpcUrl,
    chain,
  };
}

export async function submitSponsoredClaim(args: {
  cfg: SponsoredClaimConfig;
  root: Hex;
  beneficiary: Address;
  amount: bigint;
  proof: Hex[];
}): Promise<Hex> {
  const account = privateKeyToAccount(args.cfg.relayerPk);
  const client = createWalletClient({
    account,
    chain: args.cfg.chain,
    transport: http(args.cfg.rpcUrl),
  });
  return client.writeContract({
    address: args.cfg.emissions,
    abi: emissionsClaimAbi,
    functionName: "claim",
    args: [args.root, args.beneficiary, args.amount, args.proof],
  });
}

export async function assertRootActiveAndNotClaimed(
  cfg: SponsoredClaimConfig,
  root: Hex,
  beneficiary: Address,
  amount: bigint,
): Promise<void> {
  const pub = createPublicClient({
    chain: cfg.chain,
    transport: http(cfg.rpcUrl),
  });
  const active = await pub.readContract({
    address: cfg.emissions,
    abi: emissionsClaimAbi,
    functionName: "roots",
    args: [root],
  });
  if (!active) throw new Error("root_inactive");
  const leaf = merkleClaimLeaf(beneficiary, amount);
  const done = await pub.readContract({
    address: cfg.emissions,
    abi: emissionsClaimAbi,
    functionName: "claimed",
    args: [root, leaf],
  });
  if (done) throw new Error("already_claimed");
}
