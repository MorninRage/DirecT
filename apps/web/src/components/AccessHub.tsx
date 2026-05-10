import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Connector } from "wagmi";
import { useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Link } from "react-router-dom";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { appChain } from "../chains";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { useAccountProfile } from "../auth/AccountProvider";
import { WalletDashboard } from "./WalletDashboard";

type Props = { open: boolean; onClose: () => void };

export function AccessHub({ open, onClose }: Props) {
  const { profile } = useAccountProfile();
  const { connectAsync, connectors, isPending, error: wagmiErr } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { createLocalWallet, importLocalWallet, clearLocalWallet, address, mode } = useDirectAuth();
  const [busy, setBusy] = useState(false);
  const [localReveal, setLocalReveal] = useState<string | null>(null);
  const [revealSavedAck, setRevealSavedAck] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copyPkStatus, setCopyPkStatus] = useState<string | null>(null);
  const [copyAddrStatus, setCopyAddrStatus] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [pasteKey, setPasteKey] = useState("");

  const revealAddress = useMemo(() => {
    if (!localReveal) return null;
    try {
      return privateKeyToAccount(localReveal as Hex).address;
    } catch {
      return null;
    }
  }, [localReveal]);

  const stableClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (localReveal && !revealSavedAck) return;
        stableClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, stableClose, localReveal, revealSavedAck]);

  useEffect(() => {
    if (!localReveal) {
      setRevealSavedAck(false);
      setKeyRevealed(false);
      setCopyPkStatus(null);
      setCopyAddrStatus(null);
    }
  }, [localReveal]);

  if (!open) return null;

  const walletLinkHint =
    profile && address ? (
      <>
        Link this signer on{" "}
        <Link className="hud-link" to={`/direct/${address}`} onClick={stableClose}>
          Wallet link
        </Link>
        .
      </>
    ) : profile ? (
      <>
        After you connect a signer, open <strong>Wallet link</strong> in the top bar to sign and link it to @{profile.handle}.
      </>
    ) : null;

  const connectWallet = async (c: Connector) => {
    setBusy(true);
    setLocalErr(null);
    try {
      clearLocalWallet();
      await disconnectAsync().catch(() => undefined);
      await connectAsync({ connector: c, chainId: appChain.id });
      await switchChainAsync?.({ chainId: appChain.id }).catch(() => undefined);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCreateLocal = async () => {
    setBusy(true);
    setLocalErr(null);
    try {
      const pk = await createLocalWallet();
      setLocalReveal(pk);
      setRevealSavedAck(false);
      setKeyRevealed(false);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImportLocal = async () => {
    setBusy(true);
    setLocalErr(null);
    try {
      await importLocalWallet(pasteKey);
      setPasteKey("");
      setLocalReveal(null);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const uniqueConnectors = connectors.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);

  const onBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (localReveal && !revealSavedAck) return;
    stableClose();
  };

  const copyPk = async () => {
    if (!localReveal) return;
    try {
      await navigator.clipboard.writeText(localReveal);
      setCopyPkStatus("Copied");
      window.setTimeout(() => setCopyPkStatus(null), 2000);
    } catch {
      setCopyPkStatus("Copy failed");
    }
  };

  const copyRevealAddress = async () => {
    if (!revealAddress) return;
    try {
      await navigator.clipboard.writeText(revealAddress);
      setCopyAddrStatus("Copied");
      window.setTimeout(() => setCopyAddrStatus(null), 2000);
    } catch {
      setCopyAddrStatus("Copy failed");
    }
  };

  const downloadPk = () => {
    if (!localReveal) return;
    const blob = new Blob(
      [
        "DirecT embedded recovery key (keep secret; never share)\n\n",
        localReveal,
        "\n",
      ],
      { type: "text/plain;charset=utf-8" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "direct-embedded-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const finishReveal = () => {
    if (!revealSavedAck) return;
    setLocalReveal(null);
  };

  const dialog = (
    <div
      className="hud-modal-overlay"
      role="presentation"
      onMouseDown={onBackdropMouseDown}
    >
      <div
        className="hud-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-hub-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="hud-modal__header">
          <h2 id="access-hub-title">DirecT wallet</h2>
          <button
            type="button"
            className="hud-btn hud-modal__close"
            aria-label="Close dialog"
            disabled={busy || Boolean(localReveal && !revealSavedAck)}
            onClick={stableClose}
          >
            ×
          </button>
        </div>

        <div className="hud-modal__body">
          {localReveal ? (
            <div
              className="hud-alert"
              style={{
                marginBottom: 16,
                background: "rgba(40,80,140,0.2)",
                borderColor: "rgba(120,180,255,0.35)",
                borderWidth: 2,
              }}
            >
              <h3 style={{ margin: "0 0 8px", fontSize: 16, letterSpacing: "0.06em" }}>Recovery key (secret)</h3>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--hud-dim)", lineHeight: 1.55 }}>
                This long hex is your <strong>private key</strong>. It is <strong>not</strong> your profile password and <strong>not</strong> your share
                link. Anyone with this key controls this signer. Save it offline before continuing.
              </p>
              {!keyRevealed ? (
                <button type="button" className="hud-btn hud-btn--primary" onClick={() => setKeyRevealed(true)}>
                  Show recovery key
                </button>
              ) : (
                <div className="hud-mono" style={{ marginTop: 8, wordBreak: "break-all", fontSize: 12, lineHeight: 1.4 }}>
                  {localReveal}
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <button type="button" className="hud-btn" disabled={!keyRevealed} onClick={() => void copyPk()}>
                  Copy recovery key
                </button>
                <button type="button" className="hud-btn" disabled={!keyRevealed} onClick={downloadPk}>
                  Download .txt
                </button>
                {copyPkStatus ? <span style={{ fontSize: 12, alignSelf: "center", color: "var(--hud-dim)" }}>{copyPkStatus}</span> : null}
              </div>
              {revealAddress ? (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(126,203,255,0.2)" }}>
                  <div className="hud-label" style={{ marginBottom: 6 }}>
                    Signing address (public)
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--hud-dim)" }}>
                    Use this when sharing your wallet page. It is derived from the recovery key above — it is not the secret.
                  </p>
                  <div className="hud-mono" style={{ fontSize: 12, wordBreak: "break-all" }}>
                    {revealAddress}
                  </div>
                  <button type="button" className="hud-btn" style={{ marginTop: 8 }} onClick={() => void copyRevealAddress()}>
                    Copy address
                  </button>
                  {copyAddrStatus ? (
                    <span style={{ marginLeft: 8, fontSize: 12, color: "var(--hud-dim)" }}>{copyAddrStatus}</span>
                  ) : null}
                </div>
              ) : null}
              <label
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  marginTop: 16,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={revealSavedAck}
                  onChange={(e) => setRevealSavedAck(e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>I have saved this recovery key in a safe place. I understand I cannot recover it from DirecT later.</span>
              </label>
              <button
                type="button"
                className="hud-btn hud-btn--primary"
                style={{ marginTop: 12 }}
                disabled={!revealSavedAck}
                onClick={finishReveal}
              >
                Continue
              </button>
            </div>
          ) : null}

          <p style={{ color: "var(--hud-dim)", marginTop: 0, fontSize: 14, lineHeight: 1.5 }}>
            Connect a wallet or use an embedded DirecT key to <strong>sign posts</strong>. This is separate from your profile password.
            {walletLinkHint ? <> {walletLinkHint}</> : null}
          </p>

          {address && !localReveal ? (
            <WalletDashboard address={address} profile={profile} />
          ) : !address ? (
            <p style={{ fontSize: 12, color: "var(--hud-dim)", marginBottom: 16, lineHeight: 1.5 }}>
              Connect MetaMask / Coinbase or generate an <strong>embedded DirecT key</strong> below. Your address then appears here with{" "}
              <strong>ETH</strong> and <strong>DIR</strong> balances (DIR needs <code>VITE_TOKEN_ADDRESS</code> set at build time).
            </p>
          ) : null}

          <div className="hud-label">Extension / mobile wallets</div>
          <div className="hud-connector-list">
            {uniqueConnectors.map((c) => (
              <div key={c.uid} className="hud-connector-row">
                <span>{c.name}</span>
                <button type="button" className="hud-btn" disabled={!c.ready || busy || isPending} onClick={() => void connectWallet(c)}>
                  Connect
                </button>
              </div>
            ))}
          </div>

          <div className="hud-label" style={{ marginTop: 16 }}>
            Embedded DirecT key (browser session)
          </div>
          <p style={{ fontSize: 12, color: "var(--hud-dim)", marginTop: 0, lineHeight: 1.5 }}>
            New here: generate a key and <strong>save the hex</strong> somewhere safe. Returning: paste the same key to restore your signing address in this
            browser.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <button type="button" className="hud-btn hud-btn--primary" disabled={busy || Boolean(localReveal)} onClick={() => void onCreateLocal()}>
              Generate new key
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <input
              className="hud-input hud-mono"
              type="password"
              autoComplete="off"
              placeholder="Paste saved private key (0x… or 64 hex chars)"
              value={pasteKey}
              onChange={(e) => setPasteKey(e.target.value)}
            />
            <button type="button" className="hud-btn" disabled={busy || !pasteKey.trim()} onClick={() => void onImportLocal()}>
              Import key
            </button>
          </div>

          {address && !localReveal ? (
            <p className="hud-mono" style={{ marginTop: 12, fontSize: 12 }}>
              Active signing address: {address}
              <span title={`Mode: ${mode}`} style={{ marginLeft: 8, color: "var(--hud-dim)", cursor: "help" }}>
                ({mode === "local" ? "embedded session" : "extension"})
              </span>
            </p>
          ) : null}
          {(wagmiErr?.message || localErr) && <div className="hud-alert" style={{ marginTop: 10 }}>{wagmiErr?.message ?? localErr}</div>}
        </div>

        <div className="hud-modal__footer">
          <button type="button" className="hud-btn" onClick={stableClose} disabled={busy || Boolean(localReveal && !revealSavedAck)}>
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
