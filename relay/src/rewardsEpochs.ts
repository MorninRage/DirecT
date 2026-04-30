import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");
const epochsPath = join(dataDir, "rewards-epochs.json");

export type RewardAllocationEntry = {
  beneficiary: string;
  amountWei: string;
};

export type PublishedRewardEpoch = {
  id: string;
  root: string;
  chainId: number;
  publishedAtMs: number;
  registerTxHash?: string;
  manifestUrl?: string;
  allocations: RewardAllocationEntry[];
};

type FileShape = { epochs: PublishedRewardEpoch[] };

let epochs: PublishedRewardEpoch[] = [];

export function loadRewardEpochs(): void {
  if (!existsSync(epochsPath)) return;
  try {
    const raw = JSON.parse(readFileSync(epochsPath, "utf8")) as FileShape;
    epochs = Array.isArray(raw.epochs) ? raw.epochs : [];
    console.log(`[relay] loaded ${epochs.length} reward epochs from ${epochsPath}`);
  } catch (e) {
    console.error("[relay] load rewards-epochs failed:", e);
    epochs = [];
  }
}

export function persistRewardEpochs(): void {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(epochsPath, JSON.stringify({ epochs }, null, 2) + "\n", "utf8");
  } catch (e) {
    console.error("[relay] persist rewards-epochs failed:", e);
  }
}

export function addPublishedRewardEpoch(e: PublishedRewardEpoch): void {
  if (!e.id || !e.root.startsWith("0x") || !Array.isArray(e.allocations)) {
    throw new Error("invalid_epoch_payload");
  }
  const next = epochs.filter((x) => x.id !== e.id);
  next.push(e);
  next.sort((a, b) => a.publishedAtMs - b.publishedAtMs);
  epochs = next;
  persistRewardEpochs();
}

export function getLatestRewardEpoch(): PublishedRewardEpoch | null {
  if (epochs.length === 0) return null;
  return epochs.reduce((a, b) => (a.publishedAtMs >= b.publishedAtMs ? a : b));
}

export function getAllRewardEpochs(): PublishedRewardEpoch[] {
  return [...epochs];
}
