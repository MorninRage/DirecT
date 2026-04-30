import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { formatEther, getAddress, type Hex } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { appChain } from "../chains";
import { useAccountProfile } from "../auth/AccountProvider";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { apiLatestRewardEpoch, apiSponsoredClaim, type PublishedRewardEpoch } from "../api/relayAccounts";
import type { AccountProfile } from "../types/account";
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
  /** Signing address: matches Wallet panel / feed (includes embedded “local” keys). */
  const { address, mode, broadcastWriteContract } = useDirectAuth();
  const { isConnected: wagmiConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: appChain.id });
  const [epoch, setEpoch] = useState<PublishedRewardEpoch | null | undefined>(undefined);
  const [rootActive, setRootActive] = useState<boolean | undefined>(undefined);
  const [txErr, setTxErr] = useState("");
  const [localPending, setLocalPending] = useState(false);
  const [localHash, setLocalHash] = useState<Hex | undefined>();
  const [sponsoredPending, setSponsoredPending] = useState(false);
  const [sponsoredHash, setSponsoredHash] = useState<Hex | undefined>();

  const { writeContract, data: wagmiHash, isPending, error: writeErr } = useWriteContract();
  const hash = wagmiHash ?? localHash ?? sponsoredHash;
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
      return getAddress(matchingAllocations[0].beneficiary as `0x${string}`);
    });
  }, [matchingAllocations]);

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
    if (!confirmed || !hash || !TOKEN_ADDRESS) return;
    const addrs: `0x${string}`[] = [];
    if (address) addrs.push(getAddress(address));
    if (treeAndProof && "beneficiary" in treeAndProof) addrs.push(getAddress(treeAndProof.beneficiary));
    const uniq = [...new Set(addrs.map((a) => a.toLowerCase()))].map((l) => getAddress(l as `0x${string}`));
    for (const a of uniq) {
      void queryClient.invalidateQueries({ queryKey: ["wallet", "dir-bal", a, TOKEN_ADDRESS] });
      void queryClient.invalidateQueries({ queryKey: ["wallet", "eth", a, appChain.id] });
    }
  }, [confirmed, hash, address, treeAndProof, queryClient, TOKEN_ADDRESS]);

  const onClaim = useCallback(async () => {
    setTxErr("");
    setLocalHash(undefined);
    setSponsoredHash(undefined);
    if (!epoch || !EMISSIONS_ADDRESS || !treeAndProof || "error" in treeAndProof) return;

    if (token) {
      setSponsoredPending(true);
      try {
        const { txHash } = await apiSponsoredClaim(token, treeAndProof.beneficiary);
        setSponsoredHash(txHash as Hex);
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes("sponsored_claim_disabled")) {
          setTxErr(msg);
          return;
        }
        /* Relay has no RELAYER_PRIVATE_KEY — fall back to user-paid gas. */
      } finally {
        setSponsoredPending(false);
      }
    }

    if (!address) {
      setTxErr("Open Wallet and sign in. If gasless claim is off, you need a wallet with Base Sepolia ETH.");
      return;
    }

    if (mode === "local") {
      setLocalPending(true);
      void broadcastWriteContract({
        address: EMISSIONS_ADDRESS,
        abi: emissionsControllerAbi,
        functionName: "claim",
        args: [treeAndProof.rootHex, treeAndProof.beneficiary, treeAndProof.amount, treeAndProof.proof],
      })
        .then((h) => setLocalHash(h))
        .catch((e: unknown) => setTxErr(e instanceof Error ? e.message : String(e)))
        .finally(() => setLocalPending(false));
      return;
    }

    if (!wagmiConnected) {
      setTxErr("Open Wallet (top bar) and connect MetaMask / Coinbase on Base Sepolia.");
      return;
    }

    writeContract({
      address: EMISSIONS_ADDRESS,
      abi: emissionsControllerAbi,
      functionName: "claim",
      args: [treeAndProof.rootHex, treeAndProof.beneficiary, treeAndProof.amount, treeAndProof.proof],
    });
  }, [
    epoch,
    address,
    token,
    treeAndProof,
    writeContract,
    mode,
    broadcastWriteContract,
    wagmiConnected,
  ]);

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
        The contract sends DIR to the <strong>allocation address</strong> below. When your DirecT relay is configured for
        gasless claims, you only need to be signed in — DirecT submits the transaction. Otherwise your signing wallet pays
        a small amount of Base Sepolia ETH.
      </p>
      <ul style={{ fontSize: 12, lineHeight: 1.6, color: "var(--hud-dim)", wordBreak: "break-all" }}>
        <li>Root: {epoch.root}</li>
        <li>Chain ID: {epoch.chainId} (app expects {appChain.id})</li>
        {epoch.registerTxHash ? <li>Registration tx: {epoch.registerTxHash}</li> : null}
        {rootActive === false ? <li style={{ color: "#ffb4b4" }}>This root is not active on the emissions contract yet.</li> : null}
        {rootActive === true ? <li style={{ color: "#9fe8c0" }}>Root is active on-chain.</li> : null}
      </ul>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <div className="hud-mono" style={{ fontSize: 12 }}>
          {address ? (
            <>
              <span style={{ color: "var(--hud-dim)" }}>Signing (only if you pay gas yourself):</span> {address}
            </>
          ) : (
            <span style={{ color: "var(--hud-dim)" }}>
              Signed in — with gasless claims, no browser wallet is required here.
            </span>
          )}
        </div>
        {mode === "wallet" && !wagmiConnected ? (
          <div className="hud-alert">Wallet mode needs an active browser wallet connection. Open Wallet and connect MetaMask / Coinbase.</div>
        ) : null}
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
                  relay data (first linked wallet or payout when the epoch was created).
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
              Amount: <strong>{formatEther(treeAndProof.amount)} DIR</strong>
            </div>
            <button
              type="button"
              className="hud-btn hud-btn--primary"
              disabled={rootActive === false || isPending || confirming || localPending || sponsoredPending}
              onClick={() => void onClaim()}
            >
              {sponsoredPending || localPending || isPending || confirming ? "Submitting…" : "Claim DIR"}
            </button>
            {rootActive === false ? (
              <p style={{ fontSize: 12, color: "#ffb4b4" }}>Root not active — registerRoot must succeed on-chain before claiming.</p>
            ) : null}
          </>
        ) : null}
        {writeErr ? <div className="hud-alert">{writeErr.message}</div> : null}
        {txErr ? <div className="hud-alert">{txErr}</div> : null}
        {hash ? (
          <div style={{ fontSize: 12 }}>
            Tx: {hash.slice(0, 14)}…{hash.slice(-10)}
          </div>
        ) : null}
        {confirmed ? <div style={{ color: "#9fe8c0" }}>Claim confirmed on-chain.</div> : null}
      </div>

      <p style={{ marginTop: 20, fontSize: 12, color: "var(--hud-dim)" }}>
        Signing mode: <strong>{mode}</strong> — after a successful claim, reopen <strong>Wallet</strong> or refresh; DIR balance updates from chain. Wrong
        network? Use &quot;Align chain&quot; in the header (browser wallets).
      </p>
      <Link className="hud-link" to="/" style={{ display: "inline-block", marginTop: 12 }}>
        ← Feed
      </Link>
    </div>
  );
}
