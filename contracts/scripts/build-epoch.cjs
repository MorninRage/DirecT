#!/usr/bin/env node
/**
 * Snapshot (from GET /v1/indexer/snapshot) + policy JSON → Merkle epoch artifact.
 * Usage:
 *   node scripts/build-epoch.cjs --snapshot snap.json --policy policy.json --out ./epochs
 *
 * Pool size (required one of):
 *   --pool-wei 1000000000000000000
 *   --fetch-pool --rpc-url https://... --token 0x... --emissions 0x...
 *
 * See scripts/example-epoch-policy.json
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const { ethers } = require("ethers");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sumReactions(reactions) {
  if (!reactions || typeof reactions !== "object") return 0n;
  let s = 0n;
  for (const v of Object.values(reactions)) {
    const n = BigInt(Math.max(0, Math.floor(Number(v) || 0)));
    s += n;
  }
  return s;
}

async function fetchPoolWei(rpcUrl, tokenAddr, emissionsAddr) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const erc20 = new ethers.Contract(tokenAddr, ["function balanceOf(address) view returns (uint256)"], provider);
  return erc20.balanceOf(emissionsAddr);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  void (async () => {
    const snapPath = arg("--snapshot");
    const policyPath = arg("--policy");
    const outDir = arg("--out") || path.join(process.cwd(), "epochs");
    if (!snapPath || !policyPath) {
      console.error(
        "Usage: node scripts/build-epoch.cjs --snapshot <snapshot.json> --policy <policy.json> [--out dir] [--pool-wei N | --fetch-pool --rpc-url ... --token ... --emissions ...]",
      );
      process.exit(1);
    }

    const snapshot = readJson(snapPath);
    const policy = readJson(policyPath);
    const epochId = String(policy.epochId || "").trim();
    const chainId = Number(policy.chainId);
    if (!epochId || !Number.isFinite(chainId)) {
      console.error("policy.epochId and policy.chainId required");
      process.exit(1);
    }

    const wR = BigInt(Math.max(0, Number(policy.weights?.reactions ?? 1)));
    const wC = BigInt(Math.max(0, Number(policy.weights?.comments ?? 3)));
    const wS = BigInt(Math.max(0, Number(policy.weights?.shares ?? 2)));
    const perUserCapWei = BigInt(String(policy.perUserCapWei || "0"));

    let poolWei;
    if (hasFlag("--fetch-pool")) {
      const rpc = arg("--rpc-url") || process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
      const token = arg("--token") || policy.tokenAddress;
      const emissions = arg("--emissions") || policy.emissionsAddress;
      if (!token || !emissions) {
        console.error("--fetch-pool needs --token and --emissions (or policy.tokenAddress / policy.emissionsAddress)");
        process.exit(1);
      }
      poolWei = await fetchPoolWei(rpc, token, emissions);
      console.error("[build-epoch] fetched pool balance:", poolWei.toString());
    } else {
      const pw = arg("--pool-wei") ?? (policy.poolWei != null ? String(policy.poolWei) : null);
      if (!pw) {
        console.error("Set --pool-wei, policy.poolWei, or use --fetch-pool with RPC + contracts");
        process.exit(1);
      }
      poolWei = BigInt(pw);
    }

    if (poolWei <= 0n) {
      console.error("poolWei must be > 0");
      process.exit(1);
    }

    const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    const accByHandle = new Map();
    for (const a of accounts) {
      if (a?.handle) accByHandle.set(String(a.handle).toLowerCase(), a);
    }

    const eventsArr = Array.isArray(snapshot.events) ? snapshot.events : [];
    const metricsArr = Array.isArray(snapshot.metrics) ? snapshot.metrics : [];
    const metricsMap = new Map(metricsArr.map(([k, v]) => [String(k).toLowerCase(), v]));

    /** @type {Map<string, bigint>} */
    const scoreByHandle = new Map();
    const skippedNoHandle = [];

    for (const pair of eventsArr) {
      const eid = String(pair[0] ?? "").toLowerCase();
      const env = pair[1];
      const body = env?.event?.body ?? {};
      const t = String(body.type ?? "");
      if (t !== "post" && t !== "repost") continue;
      const dh = String(body.direct_handle ?? "").toLowerCase().trim();
      if (!dh) {
        skippedNoHandle.push(eid);
        continue;
      }
      const m = metricsMap.get(eid) ?? { reactions: {}, comments: 0, shares: 0 };
      const reactSum = sumReactions(m.reactions);
      const comments = BigInt(Math.max(0, Math.floor(Number(m.comments) || 0)));
      const shares = BigInt(Math.max(0, Math.floor(Number(m.shares) || 0)));
      const add = wR * reactSum + wC * comments + wS * shares;
      scoreByHandle.set(dh, (scoreByHandle.get(dh) ?? 0n) + add);
    }

    const skippedNoBeneficiary = [];
    /** @type {Map<string, string>} handle -> beneficiary lowercase */
    const beneficiaryByHandle = new Map();
    for (const [handle] of scoreByHandle) {
      const acc = accByHandle.get(handle);
      let ben = null;
      if (acc?.payoutAddress && String(acc.payoutAddress).trim()) {
        try {
          ben = ethers.getAddress(String(acc.payoutAddress).trim());
        } catch {
          skippedNoBeneficiary.push(handle);
          continue;
        }
      } else if (Array.isArray(acc?.linkedWallets) && acc.linkedWallets.length > 0) {
        try {
          ben = ethers.getAddress(String(acc.linkedWallets[0]).trim());
        } catch {
          skippedNoBeneficiary.push(handle);
          continue;
        }
      } else {
        skippedNoBeneficiary.push(handle);
        continue;
      }
      beneficiaryByHandle.set(handle, ben.toLowerCase());
    }

    let totalScore = 0n;
    const scored = [...scoreByHandle.entries()].filter(([h]) => beneficiaryByHandle.has(h));
    for (const [, s] of scored) totalScore += s;

    /** @type {Array<[string, bigint]>} */
    let allocations = [];
    const report = {
      policy,
      skippedNoHandleOnPost: skippedNoHandle.slice(0, 200),
      skippedNoBeneficiary,
      skippedZeroScore: [],
    };

    if (totalScore === 0n || scored.length === 0) {
      console.error("[build-epoch] no scored handles with beneficiaries; writing empty epoch");
    } else {
      /** @type {Map<string, bigint>} */
      const byBenef = new Map();
      for (const [handle, score] of scored) {
        const b = beneficiaryByHandle.get(handle) ?? "";
        const raw = (poolWei * score) / totalScore;
        byBenef.set(b, (byBenef.get(b) ?? 0n) + raw);
      }

      if (perUserCapWei > 0n) {
        for (const [b, amt] of [...byBenef.entries()]) {
          if (amt > perUserCapWei) byBenef.set(b, perUserCapWei);
        }
      }

      let sum = 0n;
      for (const v of byBenef.values()) sum += v;
      if (sum > poolWei) {
        /** @type {Map<string, bigint>} */
        const scaled = new Map();
        for (const [b, amt] of byBenef.entries()) {
          scaled.set(b, (amt * poolWei) / sum);
        }
        byBenef.clear();
        for (const [b, a] of scaled) byBenef.set(b, a);
        sum = 0n;
        for (const v of byBenef.values()) sum += v;
      }

      allocations = [...byBenef.entries()]
        .filter(([, wei]) => wei > 0n)
        .map(([b, wei]) => [ethers.getAddress(b), wei]);

      allocations.sort((a, b) => a[0].localeCompare(b[0]));
    }

    const entriesForTree = allocations.map(([addr, wei]) => [addr, wei]);
    let root = ethers.ZeroHash;
    /** @type {Array<{ beneficiary: string; amountWei: string }>} */
    let allocJson = [];

    if (entriesForTree.length > 0) {
      const tree = StandardMerkleTree.of(entriesForTree, ["address", "uint256"]);
      root = tree.root;
      allocJson = entriesForTree.map(([addr, wei]) => ({
        beneficiary: addr,
        amountWei: wei.toString(),
      }));
    }

    const totalAllocatedWei = allocJson.reduce((acc, r) => acc + BigInt(r.amountWei), 0n);

    const artifact = {
      epochId,
      chainId,
      root,
      builtAtMs: Date.now(),
      poolWei: poolWei.toString(),
      totalAllocatedWei: totalAllocatedWei.toString(),
      report,
      allocations: allocJson,
    };

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const safeId = epochId.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const outFile = path.join(outDir, `epoch-${safeId}.json`);
    fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2) + "\n", "utf8");
    console.error("[build-epoch] wrote", outFile);
    console.log(outFile);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

main();
