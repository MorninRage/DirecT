import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { formatEther, getAddress, type Hex } from "viem";
import { useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { appChain } from "../chains";
import { useAccountProfile } from "../auth/AccountProvider";
import { apiLatestRewardEpoch, apiSponsoredClaim, type PublishedRewardEpoch } from "../api/relayAccounts";
import type { AccountProfile } from "../types/account";
import { preferredMerkleBeneficiary } from "../lib/rewardBeneficiary";
import { merkleClaimLeaf } from "../lib/merkleClaimLeaf";
import { EMISSIONS_ADDRESS, RELAY, TOKEN_ADDRESS } from "../config";
import { emissionsControllerAbi } from "../abi/emissionsController";

function buildTree(allocations: PublishedRewardEpoch["allocations"]) {
  const entries = allocations.map((a) => [getAddress(a.beneficiary as `0x${string}`), BigInt(a.amountWei)] as const);
  return StandardMerkleTree.of(entries, ["address", "uint256"]);
}

/** Addresses that can receive a claim on behalf of this profile (payout first, then linked wallets). */
function allocationCandidates(profile: AccountProfile): Set<string> {
  const allow = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    try {
      allow.add(getAddress(t as `0x${string}`).toLowerCase());
    } catch {
      /* skip invalid */
    }
  };
  add(profile.payoutAddress ?? null);
  for (const w of profile.linkedWallets ?? []) add(w);
  return allow;
}

export function ClaimPage() {
  const queryClient = useQueryClient();
  const { token, profile } = useAccountProfile();
  const publicClient = usePublicClient({ chainId: appChain.id });
  const [epoch, setEpoch] = useState<PublishedRewardEpoch | null | undefined>(undefined);
  const [rootActive, setRootActive] = useState<boolean | undefined>(undefined);
  const [txErr, setTxErr] = useState("");
  const [sponsoredPending, setSponsoredPending] = useState(false);
  const [sponsoredHash, setSponsoredHash] = useState<Hex | undefined>();
  const [leafClaimed, setLeafClaimed] = useState<boolean | undefined>(undefined);

  const hash = sponsoredHash;
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    void (async () => {
      try {
        const e = await apiLatestRewardEpoch();
        setEpoch(e);
      } catch {
        setEpoch(null);
      }
    })();
  }, []);

  const matchingAllocations = useMemo(() => {
    if (!epoch || !profile) return [];
    const allow = allocationCandidates(profile);
    return epoch.allocations.filter((a) => allow.has(a.beneficiary.toLowerCase()));
  }, [epoch, profile]);

  /** Merkle beneficiary (receives DIR). Caller can use a different address only to pay gas. */
  const [beneficiaryPick, setBeneficiaryPick] = useState<string>("");

  useEffect(() => {
    if (matchingAllocations.length === 0) {
      setBeneficiaryPick("");
      return;
    }
    setBeneficiaryPick((prev) => {
      const ok = prev && matchingAllocations.some((r) => r.beneficiary.toLowerCase() === prev.toLowerCase());
      if (ok) return getAddress(prev as `0x${string}`);
      const pref = profile ? preferredMerkleBeneficiary(profile) : null;
      if (pref) {
        const hit = matchingAllocations.find((r) => r.beneficiary.toLowerCase() === pref.toLowerCase());
        if (hit) return getAddress(hit.beneficiary as `0x${string}`);
      }
      return getAddress(matchingAllocations[0]!.beneficiary as `0x${string}`);
    });
  }, [matchingAllocations, profile]);

  const treeAndProof = useMemo(() => {
    if (!epoch || !EMISSIONS_ADDRESS) return null;
    if (!beneficiaryPick)
      return matchingAllocations.length === 0 ? ({ error: "not_in_epoch" as const } as const) : null;
    try {
      const tree = buildTree(epoch.allocations);
      const rootHex = tree.root as Hex;
      if (rootHex.toLowerCase() !== epoch.root.toLowerCase()) return { error: "epoch_root_mismatch_rebuild_tree" as const };
      const row = epoch.allocations.find((a) => a.beneficiary.toLowerCase() === beneficiaryPick.toLowerCase());
      if (!row) return { error: "not_in_epoch" as const };
      const benef = getAddress(row.beneficiary as `0x${string}`);
      const leaf: readonly [string, bigint] = [benef, BigInt(row.amountWei)];
      const proof = tree.getProof(leaf) as Hex[];
      return { proof, amount: BigInt(row.amountWei), rootHex, row, beneficiary: benef };
    } catch (e) {
      return { error: (e instanceof Error ? e.message : String(e)) as string };
    }
  }, [epoch, beneficiaryPick, matchingAllocations.length, EMISSIONS_ADDRESS]);

  useEffect(() => {
    void (async () => {
      if (!publicClient || !EMISSIONS_ADDRESS || !epoch?.root) {
        setRootActive(undefined);
        return;
      }
      try {
        const active = await publicClient.readContract({
          address: EMISSIONS_ADDRESS,
          abi: emissionsControllerAbi,
          functionName: "roots",
          args: [epoch.root as Hex],
        });
        setRootActive(Boolean(active));
      } catch {
        setRootActive(undefined);
      }
    })();
  }, [publicClient, epoch?.root]);

  useEffect(() => {
    void (async () => {
      if (!publicClient || !EMISSIONS_ADDRESS || !epoch?.root) {
        setLeafClaimed(undefined);
        return;
      }
      if (!treeAndProof || "error" in treeAndProof) {
        setLeafClaimed(undefined);
        return;
      }
      const leaf = merkleClaimLeaf(treeAndProof.beneficiary, treeAndProof.amount);
      try {
        const c = await publicClient.readContract({
          address: EMISSIONS_ADDRESS,
          abi: emissionsControllerAbi,
          functionName: "claimed",
          args: [epoch.root as Hex, leaf],
        });
        setLeafClaimed(Boolean(c));
      } catch {
        setLeafClaimed(undefined);
      }
    })();
  }, [publicClient, EMISSIONS_ADDRESS, epoch?.root, treeAndProof, confirmed, hash]);

  useEffect(() => {
    if (!confirmed || !hash || !TOKEN_ADDRESS || !profile) return;
    const addrs: `0x${string}`[] = [];
    if (profile.payoutAddress?.trim()) {
      try {
        addrs.push(getAddress(profile.payoutAddress.trim() as `0x${string}`));
      } catch {
        /* skip */
      }
    }
    for (const w of profile.linkedWallets ?? []) {
      try {
        addrs.push(getAddress(w as `0x${string}`));
      } catch {
        /* skip */
      }
    }
    if (treeAndProof && "beneficiary" in treeAndProof) addrs.push(getAddress(treeAndProof.beneficiary));
    const uniq = [...new Set(addrs.map((a) => a.toLowerCase()))].map((l) => getAddress(l as `0x${string}`));
    for (const a of uniq) {
      void queryClient.invalidateQueries({ queryKey: ["wallet", "dir-bal", a, TOKEN_ADDRESS] });
      void queryClient.invalidateQueries({ queryKey: ["wallet", "eth", a, appChain.id] });
    }
  }, [confirmed, hash, profile, treeAndProof, queryClient, TOKEN_ADDRESS]);

  const onClaim = useCallback(async () => {
    setTxErr("");
    setSponsoredHash(undefined);
    if (!epoch || !EMISSIONS_ADDRESS || !treeAndProof || "error" in treeAndProof) return;
    if (!token) {
      setTxErr("Sign in to claim.");
      return;
    }

    setSponsoredPending(true);
    try {
      const { txHash } = await apiSponsoredClaim(token, treeAndProof.beneficiary);
      setSponsoredHash(txHash as Hex);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("sponsored_claim_disabled")) {
        setTxErr(
          "Gasless claim is off: the relay must have RELAYER_PRIVATE_KEY and EMISSIONS_ADDRESS (Fly secrets), and the relayer needs Base Sepolia ETH. EMISSIONS_ADDRESS must match this site’s VITE_EMISSIONS_ADDRESS.",
        );
      } else {
        setTxErr(msg);
      }
    } finally {
      setSponsoredPending(false);
    }
  }, [epoch, token, treeAndProof]);

  if (!token || !profile) {
    return (
      <div className="hud-panel">
        <div className="hud-label">Rewards</div>
        <p>Sign in to see reward status.</p>
        <Link className="hud-link" to="/auth">
          Sign in
        </Link>
      </div>
    );
  }

  if (!EMISSIONS_ADDRESS || !TOKEN_ADDRESS) {
    return (
      <div className="hud-panel">
        <div className="hud-label">Rewards</div>
        <p>Set VITE_EMISSIONS_ADDRESS and VITE_TOKEN_ADDRESS on the web build.</p>
      </div>
    );
  }

  if (epoch === undefined) {
    return (
      <div className="hud-panel">
        <div className="hud-label">Rewards</div>
        <p>Loading latest epoch…</p>
      </div>
    );
  }

  if (epoch === null) {
    return (
      <div className="hud-panel">
        <div className="hud-label">Rewards</div>
        <p>No epoch published on the relay yet. When an epoch is live, your allocation appears here.</p>
        <p style={{ fontSize: 12, color: "var(--hud-dim)" }}>Relay: {RELAY}</p>
      </div>
    );
  }

  return (
    <div className="hud-panel">
      <div className="hud-label">Claim DIR</div>
      <h1 style={{ margin: "6px 0 12px", fontSize: 20 }}>Epoch {epoch.id}</h1>
      <p style={{ fontSize: 13, color: "var(--hud-dim)", lineHeight: 1.55 }}>
        The contract sends DIR to the <strong>allocation address</strong> below. Claims are <strong>gasless</strong>: after you sign in,
        DirecT&apos;s relay submits the transaction (you do not pay Base Sepolia ETH).
      </p>
      <ul style={{ fontSize: 12, lineHeight: 1.6, color: "var(--hud-dim)", wordBreak: "break-all" }}>
        <li>Root: {epoch.root}</li>
        <li>Chain ID: {epoch.chainId} (app expects {appChain.id})</li>
        {epoch.registerTxHash ? <li>Registration tx: {epoch.registerTxHash}</li> : null}
        {rootActive === false ? <li style={{ color: "#ffb4b4" }}>This root is not active on the emissions contract yet.</li> : null}
        {rootActive === true ? <li style={{ color: "#9fe8c0" }}>Root is active on-chain.</li> : null}
      </ul>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <p className="hud-mono" style={{ fontSize: 12, color: "var(--hud-dim)", margin: 0 }}>
          Signed in as <strong>@{profile.handle}</strong> — no browser wallet required to claim.
        </p>
        {matchingAllocations.length > 1 ? (
            <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
              <span style={{ color: "var(--hud-dim)" }}>Allocation to claim (you have several in this epoch)</span>
              <select
                className="hud-mono"
                style={{ padding: 8, borderRadius: 8, background: "rgba(0,0,0,0.35)", color: "inherit", border: "1px solid rgba(126,203,255,0.35)" }}
                value={beneficiaryPick}
                onChange={(e) => setBeneficiaryPick(getAddress(e.target.value as `0x${string}`))}
              >
                {matchingAllocations.map((r) => (
                  <option key={r.beneficiary} value={r.beneficiary}>
                    {r.beneficiary} — {formatEther(BigInt(r.amountWei))} DIR
                  </option>
                ))}
              </select>
            </label>
        ) : null}
        {treeAndProof && "error" in treeAndProof ? (
            <div className="hud-alert">
              {treeAndProof.error === "not_in_epoch" ? (
                <>
                  None of your linked wallets or payout address appear in this epoch&apos;s <span className="hud-mono">allocations</span>.
                  Linked: {profile.linkedWallets?.length ? profile.linkedWallets.join(", ") : "(none)"}
                  {profile.payoutAddress ? ` · Payout: ${profile.payoutAddress}` : ""}. The operator builds the tree from
                  relay data (payout if set, otherwise your most recently linked wallet — see Settings).
                </>
              ) : (
                <>Allocation: {treeAndProof.error}</>
              )}
            </div>
        ) : treeAndProof ? (
          <>
            <div className="hud-mono" style={{ fontSize: 12 }}>
              <span style={{ color: "var(--hud-dim)" }}>DIR goes to:</span> {treeAndProof.beneficiary}
            </div>
            <div>
              Epoch allocation: <strong>{formatEther(treeAndProof.amount)} DIR</strong>
            </div>
            {leafClaimed === undefined ? (
              <p style={{ fontSize: 12, color: "var(--hud-dim)" }}>Checking on-chain claim status…</p>
            ) : leafClaimed ? (
              <>
                <div>
                  Remaining to claim: <strong>0 DIR</strong>
                </div>
                <p style={{ fontSize: 12, color: "#9fe8c0", margin: 0 }}>
                  You already claimed this allocation for this epoch. Open <strong>Wallet</strong> — DIR is shown on the address above (and under any payout /
                  linked rows if it differs from your signer).
                </p>
              </>
            ) : (
              <div>
                Remaining to claim: <strong>{formatEther(treeAndProof.amount)} DIR</strong>
              </div>
            )}
            <button
              type="button"
              className="hud-btn hud-btn--primary"
              disabled={
                rootActive === false || confirming || sponsoredPending || leafClaimed === true || leafClaimed === undefined
              }
              onClick={() => void onClaim()}
            >
              {leafClaimed === true
                ? "Already claimed"
                : leafClaimed === undefined
                  ? "Checking status…"
                  : sponsoredPending || confirming
                    ? "Submitting…"
                    : "Claim DIR"}
            </button>
            {rootActive === false ? (
              <p style={{ fontSize: 12, color: "#ffb4b4" }}>Root not active — registerRoot must succeed on-chain before claiming.</p>
            ) : null}
          </>
        ) : null}
        {txErr ? <div className="hud-alert">{txErr}</div> : null}
        {hash ? (
          <div style={{ fontSize: 12 }}>
            Tx: {hash.slice(0, 14)}…{hash.slice(-10)}
          </div>
        ) : null}
        {confirmed ? <div style={{ color: "#9fe8c0" }}>Claim confirmed on-chain.</div> : null}
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: "var(--hud-dim)" }}>
        After a successful claim, open <strong>Wallet</strong> — DIR balance appears on the <strong>beneficiary address</strong> above. If that is not your signing
        address, use the payout / linked rows in the wallet panel.
      </p>
      <Link className="hud-link" to="/" style={{ display: "inline-block", marginTop: 12 }}>
        ← Feed
      </Link>
    </div>
  );
}
