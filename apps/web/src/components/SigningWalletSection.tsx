import { useState } from "react";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { useAccountProfile } from "../auth/AccountProvider";
import { apiLinkWallet, apiLinkWalletChallenge } from "../api/relayAccounts";
import { useOpenWalletHub } from "./walletHubContext";

export function SigningWalletSection() {
  const { token, profile, refresh } = useAccountProfile();
  const { address, mode, signUtf8Message } = useDirectAuth();
  const openWalletHub = useOpenWalletHub();
  const [status, setStatus] = useState("");

  if (!token || !profile) return null;

  const linkWallet = async () => {
    if (!address) {
      setStatus("Set up a signing wallet first (open Wallet).");
      return;
    }
    setStatus("Linking wallet…");
    try {
      const { message } = await apiLinkWalletChallenge(token);
      const signature = await signUtf8Message(message);
      await apiLinkWallet(token, address, message, signature);
      await refresh();
      setStatus("Wallet linked.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="hud-panel" style={{ marginBottom: 16 }}>
      <div className="hud-label">Signing wallet</div>
      <p style={{ color: "var(--hud-dim)", marginTop: 0, lineHeight: 1.55 }}>
        Link the address you use to sign posts so the relay can show <strong>@{profile.handle}</strong> on your posts. Use <strong>Wallet</strong> in the top
        bar to connect MetaMask / Coinbase or create an embedded session key.
      </p>
      <div className="hud-mono" style={{ marginBottom: 10, fontSize: 13 }}>
        Signing address: {address ?? "none"}
        {address ? (
          <span title={`Mode: ${mode}`} style={{ marginLeft: 8, color: "var(--hud-dim)" }}>
            ({mode === "local" ? "embedded session" : "extension"})
          </span>
        ) : null}
      </div>
      <div className="hud-mono" style={{ marginBottom: 10, fontSize: 13 }}>
        Linked: {profile.linkedWallets.length ? profile.linkedWallets.join(", ") : "none"}
      </div>
      {!address ? (
        <button type="button" className="hud-btn hud-btn--primary" style={{ marginBottom: 10 }} onClick={() => openWalletHub()}>
          Open wallet…
        </button>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="hud-btn hud-btn--primary" onClick={() => void linkWallet()} disabled={!address}>
          Sign message and link wallet
        </button>
        {status ? <span className="hud-mono" style={{ fontSize: 12 }}>{status}</span> : null}
      </div>
    </section>
  );
}
