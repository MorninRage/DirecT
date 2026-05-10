import { getAddress, type Address } from "viem";
import type { AccountProfile } from "../types/account";

/**
 * Same rules as relay epoch builder + sponsored claim: payout if set, else last linked wallet.
 */
export function preferredMerkleBeneficiary(profile: AccountProfile): Address | null {
  const pay = profile.payoutAddress?.trim();
  if (pay) {
    try {
      return getAddress(pay as `0x${string}`);
    } catch {
      /* fall through */
    }
  }
  const linked = profile.linkedWallets ?? [];
  if (linked.length === 0) return null;
  const raw = linked[linked.length - 1]!;
  try {
    return getAddress(raw.trim() as `0x${string}`);
  } catch {
    return null;
  }
}
