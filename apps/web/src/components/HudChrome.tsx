import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { appChain } from "../chains";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { useAccountProfile } from "../auth/AccountProvider";
import { AccessHub } from "./AccessHub";
import { NotificationBell } from "./NotificationBell";
import { OpenWalletHubContext } from "./walletHubContext";

export function HudChrome({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { address, mode, clearLocalWallet } = useDirectAuth();
  const { token, profile } = useAccountProfile();
  const loc = useLocation();
  const { chainId, isConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();

  const isPublicShell = loc.pathname.startsWith("/direct/") || /^\/u\/[^/]+$/.test(loc.pathname);

  useEffect(() => {
    const hidePostMetrics = Boolean(profile && !profile.settings.showMetricsInline);
    document.body.classList.toggle("hud-post-metrics-hidden", hidePostMetrics);
    if (!profile) {
      document.body.classList.remove("hud-high-contrast", "hud-compact-feed", "hud-reduce-motion");
      return;
    }
    document.body.classList.toggle("hud-high-contrast", profile.settings.highContrast);
    document.body.classList.toggle("hud-compact-feed", profile.settings.compactFeed);
    document.body.classList.toggle("hud-reduce-motion", profile.settings.reduceMotion);
    return () => {
      document.body.classList.remove(
        "hud-high-contrast",
        "hud-compact-feed",
        "hud-reduce-motion",
        "hud-post-metrics-hidden",
      );
    };
  }, [profile]);

  const wrongChain = mode === "wallet" && isConnected && chainId !== undefined && chainId !== appChain.id;
  const directLink = address ? `/direct/${address}` : null;
  const myPage = profile ? `/u/${profile.handle}` : null;

  const disconnectWallet = async () => {
    clearLocalWallet();
    await disconnectAsync().catch(() => undefined);
  };

  return (
    <>
      <header className="hud-topbar">
        <div className="hud-brand">DirecT</div>
        <div className="hud-top-actions">
          {token ? (
            <Link to="/" className="hud-btn">
              Feed
            </Link>
          ) : isPublicShell ? (
            <Link to="/auth" className="hud-btn" state={{ from: loc.pathname }}>
              Feed
            </Link>
          ) : null}
          {token && profile ? <NotificationBell /> : null}
          {myPage ? (
            <Link to={myPage} className="hud-btn hud-btn--primary">
              My page
            </Link>
          ) : null}
          {profile ? (
            <Link to="/settings" className="hud-btn">
              Settings
            </Link>
          ) : null}
          {directLink ? (
            <Link to={directLink} className="hud-btn">
              Wallet link
            </Link>
          ) : null}
          {wrongChain ? (
            <button
              type="button"
              className="hud-btn"
              disabled={switching}
              onClick={() => switchChainAsync?.({ chainId: appChain.id })}
            >
              Align chain
            </button>
          ) : null}
          {address ? (
            <button type="button" className="hud-btn" onClick={() => void disconnectWallet()}>
              Disconnect wallet
            </button>
          ) : null}
          {profile ? (
            <button type="button" className="hud-btn hud-btn--primary" onClick={() => setOpen(true)}>
              Wallet
            </button>
          ) : isPublicShell ? (
            <Link className="hud-btn hud-btn--primary" to="/auth" state={{ from: loc.pathname }}>
              Sign in
            </Link>
          ) : (
            <button type="button" className="hud-btn hud-btn--primary" onClick={() => setOpen(true)}>
              Wallet
            </button>
          )}
        </div>
      </header>
      <OpenWalletHubContext.Provider value={() => setOpen(true)}>
        <main className={/^\/u\/[^/]+$/.test(loc.pathname) ? "hud-shell hud-shell--fullbleed" : "hud-shell"}>{children}</main>
      </OpenWalletHubContext.Provider>
      <AccessHub open={open} onClose={() => setOpen(false)} />
      <div style={{ position: "fixed", bottom: 8, right: 12, fontSize: 10, color: "var(--hud-dim)", zIndex: 40 }}>
        {profile ? (
          <>
            @{profile.handle}
            {address ? (
              <>
                {" "}
                · {address.slice(0, 6)}…{address.slice(-4)}
              </>
            ) : null}
          </>
        ) : address ? (
          <>
            {mode} · {address.slice(0, 6)}…{address.slice(-4)}
          </>
        ) : (
          "offline"
        )}
      </div>
    </>
  );
}
