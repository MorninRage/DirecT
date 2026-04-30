import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { useAccountProfile } from "../auth/AccountProvider";
import { apiLinkWallet, apiLinkWalletChallenge, apiPatchProfile } from "../api/relayAccounts";
import type { AccountProfile } from "../types/account";
import { useOpenWalletHub } from "../components/walletHubContext";

const LINK_KEYS = ["website", "twitter", "x", "instagram", "github", "youtube", "linkedin", "tiktok"] as const;

export function SettingsPage() {
  const { token, profile, refresh, logout } = useAccountProfile();
  const { address, mode, signUtf8Message } = useDirectAuth();
  const openWalletHub = useOpenWalletHub();
  const [draft, setDraft] = useState<AccountProfile | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!profile) return;
    const d = structuredClone(profile);
    const defaults = {
      compactFeed: false,
      showMetricsInline: true,
      highContrast: false,
      reduceMotion: false,
      communityFeedUnlocked: false,
    };
    d.settings = { ...defaults, ...d.settings };
    setDraft(d);
  }, [profile]);

  if (!token || !profile || !draft) {
    return (
      <div className="hud-panel">
        <div className="hud-label">Settings</div>
        <p>You need to be logged into a DirecT profile.</p>
        <Link className="hud-link" to="/">
          Back to feed
        </Link>
      </div>
    );
  }

  const save = async () => {
    setStatus("Saving…");
    try {
      const next = await apiPatchProfile(token, {
        displayName: draft.displayName,
        bio: draft.bio,
        about: draft.about,
        profession: draft.profession,
        location: draft.location,
        socialLinks: draft.socialLinks,
        settings: draft.settings,
      });
      setDraft(next);
      await refresh();
      setStatus("Saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const linkWallet = async () => {
    if (!address) {
      setStatus("Set up a signing wallet first (button below).");
      return;
    }
    setStatus("Linking wallet…");
    try {
      const { message } = await apiLinkWalletChallenge(token);
      const signature = await signUtf8Message(message);
      await apiLinkWallet(token, address, message, signature);
      await refresh();
      setDraft((d) => (d ? { ...d, linkedWallets: [...new Set([...d.linkedWallets, address.toLowerCase()])] } : d));
      setStatus("Wallet linked.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <section className="hud-panel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="hud-label">Profile settings</div>
            <h1 style={{ margin: "6px 0 0" }}>@{profile.handle}</h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="hud-btn" to={`/u/${profile.handle}`}>
              View my page
            </Link>
            <button type="button" className="hud-btn" onClick={() => logout()}>
              Log out
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          <label className="hud-label">Display name</label>
          <input className="hud-input" value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />

          <label className="hud-label">Bio</label>
          <textarea className="hud-textarea" value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />

          <label className="hud-label">About</label>
          <textarea className="hud-textarea" value={draft.about} onChange={(e) => setDraft({ ...draft, about: e.target.value })} />

          <label className="hud-label">Profession</label>
          <input className="hud-input" value={draft.profession} onChange={(e) => setDraft({ ...draft, profession: e.target.value })} />

          <label className="hud-label">Location</label>
          <input className="hud-input" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />

          <div className="hud-label">Social links</div>
          <div style={{ display: "grid", gap: 8 }}>
            {LINK_KEYS.map((k) => (
              <input
                key={k}
                className="hud-input"
                placeholder={k}
                value={draft.socialLinks[k] ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    socialLinks: { ...draft.socialLinks, [k]: e.target.value },
                  })
                }
              />
            ))}
          </div>

          <div className="hud-label">Interface</div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.settings.compactFeed}
              onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, compactFeed: e.target.checked } })}
            />
            Compact feed density
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.settings.showMetricsInline}
              onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, showMetricsInline: e.target.checked } })}
            />
            Show metrics inline
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.settings.highContrast}
              onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, highContrast: e.target.checked } })}
            />
            High contrast
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.settings.reduceMotion}
              onChange={(e) => setDraft({ ...draft, settings: { ...draft.settings, reduceMotion: e.target.checked } })}
            />
            Reduce motion
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.settings.communityFeedUnlocked}
              onChange={(e) =>
                setDraft({ ...draft, settings: { ...draft.settings, communityFeedUnlocked: e.target.checked } })
              }
            />
            Show network feed (community posts on Home)
          </label>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="hud-btn hud-btn--primary" onClick={() => void save()}>
            Save profile
          </button>
          <span className="hud-mono">{status}</span>
        </div>
      </section>

      <section className="hud-panel" style={{ marginTop: 16 }}>
        <div className="hud-label">Signing wallet linkage</div>
        <p style={{ color: "var(--hud-dim)", marginTop: 0, lineHeight: 1.55 }}>
          Link the address you use to sign posts. Required if you want posts to carry <strong>@{profile.handle}</strong> and pass relay checks.
          Use the top bar <strong>Wallet</strong> button to connect MetaMask / Coinbase or generate an embedded signing key (session-only).
        </p>
        <div className="hud-mono" style={{ marginBottom: 10 }}>
          Signing address: {address ?? "none"} {address ? `(${mode})` : null}
        </div>
        <div className="hud-mono" style={{ marginBottom: 10 }}>
          Linked: {profile.linkedWallets.length ? profile.linkedWallets.join(", ") : "none"}
        </div>
        {!address ? (
          <button type="button" className="hud-btn hud-btn--primary" style={{ marginBottom: 10 }} onClick={() => openWalletHub()}>
            Connect or create signing wallet…
          </button>
        ) : null}
        <button type="button" className="hud-btn hud-btn--primary" onClick={() => void linkWallet()} disabled={!address}>
          Sign message & link wallet
        </button>
      </section>
    </div>
  );
}
