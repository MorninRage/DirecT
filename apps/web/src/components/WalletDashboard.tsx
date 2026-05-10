import { useCallback, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { usePublicClient } from "wagmi";
import { formatEther, formatUnits, getAddress, type Address } from "viem";
import { appChain } from "../chains";
import { TOKEN_ADDRESS, EMISSIONS_ADDRESS } from "../config";
import { direcTokenPublicAbi } from "../abi/direcToken";
import type { AccountProfile } from "../types/account";

type Props = { address: Address; profile?: AccountProfile | null };

function collectProfileRewardAddresses(profile: AccountProfile, signing: Address): { label: string; addr: Address }[] {
  const sig = signing.toLowerCase();
  const out: { label: string; addr: Address }[] = [];
  const seen = new Set<string>([sig]);

  const add = (label: string, raw: string | null | undefined) => {
    const t = raw?.trim();
    if (!t) return;
    try {
      const a = getAddress(t as `0x${string}`);
      const k = a.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ label, addr: a });
    } catch {
      /* skip */
    }
  };

  add("Payout / claim address", profile.payoutAddress ?? null);
  for (const w of profile.linkedWallets ?? []) add("Linked wallet", w);
  return out;
}

export function WalletDashboard({ address, profile }: Props) {
  const publicClient = usePublicClient({ chainId: appChain.id });
  const [copied, setCopied] = useState<string | null>(null);

  const extras = profile ? collectProfileRewardAddresses(profile, address) : [];

  const copy = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }, []);

  const ethQuery = useQuery({
    queryKey: ["wallet", "eth", address, appChain.id],
    queryFn: () => publicClient!.getBalance({ address }),
    enabled: Boolean(publicClient && address),
  });

  const dirMeta = useQuery({
    queryKey: ["wallet", "dir-meta", TOKEN_ADDRESS],
    queryFn: async () => {
      const [dec, sym, cap, supply] = await Promise.all([
        publicClient!.readContract({
          address: TOKEN_ADDRESS!,
          abi: direcTokenPublicAbi,
          functionName: "decimals",
        }),
        publicClient!.readContract({
          address: TOKEN_ADDRESS!,
          abi: direcTokenPublicAbi,
          functionName: "symbol",
        }),
        publicClient!.readContract({
          address: TOKEN_ADDRESS!,
          abi: direcTokenPublicAbi,
          functionName: "MAX_SUPPLY",
        }),
        publicClient!.readContract({
          address: TOKEN_ADDRESS!,
          abi: direcTokenPublicAbi,
          functionName: "totalSupply",
        }),
      ]);
      return { decimals: dec, symbol: sym, maxSupply: cap, totalSupply: supply };
    },
    enabled: Boolean(publicClient && TOKEN_ADDRESS),
  });

  const dirBal = useQuery({
    queryKey: ["wallet", "dir-bal", address, TOKEN_ADDRESS],
    queryFn: () =>
      publicClient!.readContract({
        address: TOKEN_ADDRESS!,
        abi: direcTokenPublicAbi,
        functionName: "balanceOf",
        args: [address],
      }),
    enabled: Boolean(publicClient && address && TOKEN_ADDRESS),
  });

  const extraDirQueries = useQueries({
    queries: extras.map((e) => ({
      queryKey: ["wallet", "dir-bal", e.addr, TOKEN_ADDRESS],
      queryFn: () =>
        publicClient!.readContract({
          address: TOKEN_ADDRESS!,
          abi: direcTokenPublicAbi,
          functionName: "balanceOf",
          args: [e.addr],
        }),
      enabled: Boolean(publicClient && TOKEN_ADDRESS),
    })),
  });

  const ethStr =
    ethQuery.data !== undefined ? `${formatEther(ethQuery.data)} ${appChain.nativeCurrency.symbol}` : ethQuery.isLoading ? "…" : "—";

  const dirDecimals = dirMeta.data?.decimals ?? 18;
  const dirSymbol = dirMeta.data?.symbol ?? "DIR";
  const dirStr =
    dirBal.data !== undefined
      ? `${formatUnits(dirBal.data, dirDecimals)} ${dirSymbol}`
      : TOKEN_ADDRESS
        ? dirBal.isLoading
          ? "…"
          : "—"
        : "Configure VITE_TOKEN_ADDRESS";

  /** Avoid a misleading "0 DIR" above when claim proceeds go to payout/linked rows below. */
  const signerDirLoading = Boolean(TOKEN_ADDRESS && dirBal.isLoading);
  const showSignerDirRow =
    !TOKEN_ADDRESS ||
    extras.length === 0 ||
    signerDirLoading ||
    (dirBal.data !== undefined && dirBal.data > 0n);
  const showSignerHasNoDirHint =
    Boolean(TOKEN_ADDRESS) && extras.length > 0 && !signerDirLoading && dirBal.data !== undefined && dirBal.data === 0n;

  return (
    <div
      style={{
        marginTop: 4,
        marginBottom: 16,
        padding: 14,
        borderRadius: 10,
        border: "1px solid rgba(126,203,255,0.3)",
        background: "rgba(0,0,0,0.25)",
      }}
    >
      <div className="hud-label" style={{ marginBottom: 10 }}>
        Your DirecT wallet (signing address)
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--hud-dim)", lineHeight: 1.5 }}>
        This address <strong>signs your posts</strong>. Merkle rewards <strong>claim</strong> sends DIR to your <strong>payout address</strong> (Settings) or your
        most recently linked wallet — that beneficiary can differ from this signer.
        {EMISSIONS_ADDRESS ? (
          <>
            {" "}
            <Link className="hud-link" to="/claim">
              Open Rewards to claim
            </Link>
            .
          </>
        ) : null}
      </p>
      <div className="hud-mono" style={{ fontSize: 12, wordBreak: "break-all", marginBottom: 8 }}>
        {address}
      </div>
      <button type="button" className="hud-btn" style={{ marginBottom: 12 }} onClick={() => void copy("addr", address)}>
        {copied === "addr" ? "Copied" : "Copy address"}
      </button>

      <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
        <div>
          <span style={{ color: "var(--hud-dim)" }}>Network · </span>
          <strong>{appChain.name}</strong> (chain {appChain.id})
        </div>
        <div>
          <span style={{ color: "var(--hud-dim)" }}>Native balance · </span>
          <strong>{ethStr}</strong>
        </div>
        {ethQuery.data !== undefined && ethQuery.data === 0n ? (
          <div style={{ fontSize: 11, color: "var(--hud-dim)", lineHeight: 1.45, marginTop: -2 }}>
            {EMISSIONS_ADDRESS
              ? "Merkle reward claims are gasless (DirecT’s relay pays gas). This address does not get automatic testnet ETH—only add ETH here if you want to send your own txs on Base Sepolia (use a faucet)."
              : "No testnet ETH is added to your signer automatically. Use a Base Sepolia faucet if you need gas for your own transactions."}
          </div>
        ) : null}
        {showSignerDirRow ? (
          <div>
            <span style={{ color: "var(--hud-dim)" }}>{extras.length > 0 ? "DIR on signing address · " : "DIR balance · "}</span>
            <strong>{dirStr}</strong>
          </div>
        ) : showSignerHasNoDirHint ? (
          <div style={{ fontSize: 12, color: "var(--hud-dim)", lineHeight: 1.45 }}>
            <strong>DIR</strong> from claims is credited under <strong>payout / linked</strong> below (this signer has no DIR).
          </div>
        ) : null}
        {dirMeta.data ? (
          <div style={{ fontSize: 11, color: "var(--hud-dim)" }}>
            DIR total minted · {formatUnits(dirMeta.data.totalSupply, dirMeta.data.decimals)} /{" "}
            {formatUnits(dirMeta.data.maxSupply, dirMeta.data.decimals)} {dirSymbol} cap
          </div>
        ) : null}
      </div>

      {extras.length > 0 ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(126,203,255,0.2)" }}>
          <div className="hud-label" style={{ marginBottom: 8, fontSize: 11 }}>
            Payout & linked addresses (Merkle claims credit DIR here)
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {extras.map((e, i) => {
              const q = extraDirQueries[i];
              const bal =
                q?.data !== undefined
                  ? `${formatUnits(q.data, dirDecimals)} ${dirSymbol}`
                  : TOKEN_ADDRESS
                    ? q?.isLoading
                      ? "…"
                      : "—"
                    : "—";
              return (
                <div key={e.addr} style={{ fontSize: 12 }}>
                  <div style={{ color: "var(--hud-dim)" }}>{e.label}</div>
                  <div className="hud-mono" style={{ wordBreak: "break-all", marginTop: 2 }}>
                    {e.addr}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ color: "var(--hud-dim)" }}>DIR · </span>
                    <strong>{bal}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
