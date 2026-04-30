import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { formatEther, getAddress, type Hex } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { useAccountProfile } from "../auth/AccountProvider";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { apiLatestRewardEpoch, type PublishedRewardEpoch } from "../api/relayAccounts";
import { EMISSIONS_ADDRESS, RELAY, TOKEN_ADDRESS } from "../config";
import { appChain } from "../chains";
import { emissionsControllerAbi } from "../abi/emissionsController";

function buildTree(allocations: PublishedRewardEpoch["allocations"]) {
  const entries = allocations.map((a) => [getAddress(a.beneficiary as `0x${string}`), BigInt(a.amountWei)] as const);
  return StandardMerkleTree.of(entries, ["address", "uint256"]);
}

export function ClaimPage() {
  const { token, profile } = useAccountProfile();
  const { address, isConnected } = useAccount();
  const { mode } = useDirectAuth();
  const publicClient = usePublicClient({ chainId: appChain.id });
  const [epoch, setEpoch] = useState<PublishedRewardEpoch | null | undefined>(undefined);
  const [rootActive, setRootActive] = useState<boolean | undefined>(undefined);
  const [txErr, setTxErr] = useState("");

  const { writeContract, data: hash, isPending, error: writeErr } = useWriteContract();
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

  const treeAndProof = useMemo(() => {
    if (!epoch || !address || !EMISSIONS_ADDRESS) return null;
    try {
      const tree = buildTree(epoch.allocations);
      const rootHex = tree.root as Hex;
      if (rootHex.toLowerCase() !== epoch.root.toLowerCase()) return { error: "epoch_root_mismatch_rebuild_tree" as const };
      const row = epoch.allocations.find((a) => a.beneficiary.toLowerCase() === address.toLowerCase());
      if (!row) return { error: "not_in_epoch" as const };
      const leaf: readonly [string, bigint] = [getAddress(address), BigInt(row.amountWei)];
      const proof = tree.getProof(leaf) as Hex[];
      return { proof, amount: BigInt(row.amountWei), rootHex, row };
    } catch (e) {
      return { error: (e instanceof Error ? e.message : String(e)) as string };
    }
  }, [epoch, address]);

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

  const onClaim = useCallback(() => {
    setTxErr("");
    if (!epoch || !address || !EMISSIONS_ADDRESS || !treeAndProof || "error" in treeAndProof) return;
    writeContract({
      address: EMISSIONS_ADDRESS,
      abi: emissionsControllerAbi,
      functionName: "claim",
      args: [treeAndProof.rootHex, getAddress(address), treeAndProof.amount, treeAndProof.proof],
    });
  }, [epoch, address, treeAndProof, writeContract]);

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
        Merkle root registered on-chain must match this epoch. Claims transfer DIR from the emissions contract to your{" "}
        <strong>connected wallet</strong> — link that wallet to @{profile.handle} in Settings if you have not already.
      </p>
      <ul style={{ fontSize: 12, lineHeight: 1.6, color: "var(--hud-dim)", wordBreak: "break-all" }}>
        <li>Root: {epoch.root}</li>
        <li>Chain ID: {epoch.chainId} (app expects {appChain.id})</li>
        {epoch.registerTxHash ? <li>Registration tx: {epoch.registerTxHash}</li> : null}
        {rootActive === false ? <li style={{ color: "#ffb4b4" }}>This root is not active on the emissions contract yet.</li> : null}
        {rootActive === true ? <li style={{ color: "#9fe8c0" }}>Root is active on-chain.</li> : null}
      </ul>

      {!isConnected || !address ? (
        <p style={{ marginTop: 16 }}>Connect a wallet (top bar) to claim.</p>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <div className="hud-mono" style={{ fontSize: 12 }}>
            Beneficiary (connected): {address}
          </div>
          {treeAndProof && "error" in treeAndProof ? (
            <div className="hud-alert">Allocation: {treeAndProof.error}</div>
          ) : treeAndProof ? (
            <>
              <div>
                Amount: <strong>{formatEther(treeAndProof.amount)} DIR</strong>
              </div>
              <button type="button" className="hud-btn hud-btn--primary" disabled={isPending || confirming} onClick={() => onClaim()}>
                {isPending || confirming ? "Confirm in wallet…" : "Claim"}
              </button>
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
      )}

      <p style={{ marginTop: 20, fontSize: 12, color: "var(--hud-dim)" }}>
        Signing mode: {mode}. Wrong network? Use &quot;Align chain&quot; in the header.
      </p>
      <Link className="hud-link" to="/" style={{ display: "inline-block", marginTop: 12 }}>
        ← Feed
      </Link>
    </div>
  );
}
