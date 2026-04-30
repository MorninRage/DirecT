import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { usePublicClient } from "wagmi";
import { formatEther, formatUnits, type Address } from "viem";
import { appChain } from "../chains";
import { TOKEN_ADDRESS, EMISSIONS_ADDRESS } from "../config";
import { direcTokenPublicAbi } from "../abi/direcToken";

type Props = { address: Address };

export function WalletDashboard({ address }: Props) {
  const publicClient = usePublicClient({ chainId: appChain.id });
  const [copied, setCopied] = useState<string | null>(null);

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
        This address signs your posts and receives <strong>DIR</strong> from on-chain Merkle claims when you are in a published epoch.
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
        <div>
          <span style={{ color: "var(--hud-dim)" }}>DIR balance · </span>
          <strong>{dirStr}</strong>
        </div>
        {dirMeta.data ? (
          <div style={{ fontSize: 11, color: "var(--hud-dim)" }}>
            DIR total minted · {formatUnits(dirMeta.data.totalSupply, dirMeta.data.decimals)} /{" "}
            {formatUnits(dirMeta.data.maxSupply, dirMeta.data.decimals)} {dirSymbol} cap
          </div>
        ) : null}
      </div>
    </div>
  );
}
