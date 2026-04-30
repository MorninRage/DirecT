import { useState } from "react";
import type { Connector } from "wagmi";
import { useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Link } from "react-router-dom";
import { appChain } from "../chains";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { useAccountProfile } from "../auth/AccountProvider";

type Props = { open: boolean; onClose: () => void };

export function AccessHub({ open, onClose }: Props) {
  const { profile } = useAccountProfile();
  const { connectAsync, connectors, isPending, error: wagmiErr } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { createLocalWallet, importLocalWallet, clearLocalWallet, address, mode } = useDirectAuth();
  const [busy, setBusy] = useState(false);
  const [localReveal, setLocalReveal] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [pasteKey, setPasteKey] = useState("");

  if (!open) return null;

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

  return (
    <div className="hud-modal-overlay" role="dialog" aria-modal="true">
      <div className="hud-modal" style={{ maxWidth: 520 }}>
        <h2>Wallet & signing</h2>
        <p style={{ color: "var(--hud-dim)", marginTop: 0, fontSize: 14, lineHeight: 1.5 }}>
          Connect a wallet or use an embedded DirecT key to <strong>sign posts</strong>. This is separate from your profile password.
          {profile ? (
            <>
              {" "}
              Link this address to <strong>@{profile.handle}</strong> under{" "}
              <Link className="hud-link" to="/settings" onClick={onClose}>
                Settings
              </Link>
              .
            </>
          ) : null}
        </p>

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
          New here: generate a key and <strong>save the hex</strong> somewhere safe. Returning: paste the same key to restore your signing address
          in this browser.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <button type="button" className="hud-btn hud-btn--primary" disabled={busy} onClick={() => void onCreateLocal()}>
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

        {address ? (
          <p className="hud-mono" style={{ marginTop: 12 }}>
            Active signer: {address} ({mode})
          </p>
        ) : null}
        {(wagmiErr?.message || localErr) && <div className="hud-alert" style={{ marginTop: 10 }}>{wagmiErr?.message ?? localErr}</div>}
        {localReveal ? (
          <div className="hud-alert" style={{ background: "rgba(60,120,200,0.12)", borderColor: "rgba(120,180,255,0.25)" }}>
            <strong>Save this private key once.</strong> Use “Import key” next time to reconnect this signer.
            <div className="hud-mono" style={{ marginTop: 8, wordBreak: "break-all" }}>
              {localReveal}
            </div>
            <button type="button" className="hud-btn" style={{ marginTop: 8 }} onClick={() => setLocalReveal(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" className="hud-btn" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
