import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PostCard, type FeedPost, type PostMetrics } from "../components/PostCard";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { useAccountProfile } from "../auth/AccountProvider";
import { apiPatchProfile } from "../api/relayAccounts";
import { RELAY } from "../config";
import { feedUrl, fetchFeed } from "../api/feed";

export function FeedPage() {
  const { address, ready } = useDirectAuth();
  const { profile, token, refresh } = useAccountProfile();
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [metrics, setMetrics] = useState<Record<string, PostMetrics | undefined>>({});
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [feedScope, setFeedScope] = useState<"all" | "following">("all");

  const feedUnlocked = profile?.settings.communityFeedUnlocked === true;
  const linked =
    profile != null &&
    address != null &&
    profile.linkedWallets.some((a) => a.toLowerCase() === address.toLowerCase());
  const homepageReady = Boolean(profile?.bio?.trim() || profile?.about?.trim());

  const refreshFeed = useCallback(async () => {
    if (!feedUnlocked) return;
    const r =
      feedScope === "following" && token ? await fetchFeed({ token, scope: "following" }) : await fetch(feedUrl());
    if (r.ok) setFeed(await r.json());
  }, [feedUnlocked, feedScope, token]);

  useEffect(() => {
    void refreshFeed();
  }, [refreshFeed]);

  const loadMetrics = async (eid: string) => {
    const r = await fetch(`${RELAY}/v1/metrics/${eid}`);
    if (!r.ok) return;
    const m = (await r.json()) as PostMetrics;
    setMetrics((prev) => ({ ...prev, [eid]: m }));
  };

  const unlockNetworkFeed = async () => {
    if (!token || !profile) return;
    setUnlockBusy(true);
    try {
      await apiPatchProfile(token, {
        settings: {
          ...profile.settings,
          communityFeedUnlocked: true,
        },
      });
      await refresh();
    } catch {
      /* ignore */
    } finally {
      setUnlockBusy(false);
    }
  };

  const canUnlock = Boolean(address && linked && homepageReady && profile);

  return (
    <>
      <section className="hud-panel" style={{ marginBottom: 20 }}>
        <div className="hud-label">Home</div>
        <h1 style={{ margin: "6px 0 4px", fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          DirecT
        </h1>
        <p style={{ margin: 0, color: "var(--hud-dim)", lineHeight: 1.55 }}>
          Finish setup, then open the network feed. <strong>Write posts on My page</strong>
          {profile ? (
            <>
              {" "}
              (<Link to={`/u/${profile.handle}`}>@{profile.handle}</Link>)
            </>
          ) : null}
          , not on Home. Activity on your posts appears under <strong>Alerts</strong>.
        </p>
        {!ready ? <div className="hud-alert">Initializing wallets…</div> : null}
      </section>

      {!feedUnlocked ? (
        <section className="hud-panel" style={{ marginBottom: 20 }}>
          <div className="hud-label">Setup checklist</div>
          <ol style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
            <li style={{ color: profile ? "var(--hud-ice)" : undefined }}>
              <strong>Profile</strong> — signed in as @{profile?.handle}
            </li>
            <li style={{ color: address ? "var(--hud-ice)" : undefined }}>
              <strong>Signing wallet</strong> — {address ? "connected" : "connect the Wallet button in the top bar"}
            </li>
            <li style={{ color: linked ? "var(--hud-ice)" : undefined }}>
              <strong>Link wallet</strong> —{" "}
              {linked ? "linked to your profile" : <Link to="/settings">complete in Settings</Link>}
            </li>
            <li style={{ color: homepageReady ? "var(--hud-ice)" : undefined }}>
              <strong>Homepage</strong> —{" "}
              {homepageReady ? "bio or about filled" : <Link to="/settings">add a bio or about in Settings</Link>}
            </li>
          </ol>
          <button
            type="button"
            className="hud-btn hud-btn--primary"
            style={{ marginTop: 16 }}
            disabled={!canUnlock || unlockBusy}
            onClick={() => void unlockNetworkFeed()}
          >
            Unlock network feed
          </button>
          <p style={{ fontSize: 12, color: "var(--hud-dim)", marginTop: 10 }}>
            Until you unlock it, you won’t see everyone’s posts here — open{" "}
            {profile ? <Link to={`/u/${profile.handle}`}>My page</Link> : <Link to="/settings">My page</Link>} to post and manage your homepage.
          </p>
        </section>
      ) : null}

      {feedUnlocked ? (
        <section className="hud-panel">
          <div className="hud-label">Network feed</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <strong>{feedScope === "following" ? "Following" : "Everyone"}</strong>
              <button
                type="button"
                className="hud-btn"
                disabled={!token}
                onClick={() => setFeedScope("all")}
                style={feedScope === "all" ? { opacity: 1 } : { opacity: 0.65 }}
              >
                All
              </button>
              <button
                type="button"
                className="hud-btn"
                disabled={!token}
                onClick={() => setFeedScope("following")}
                style={feedScope === "following" ? { opacity: 1 } : { opacity: 0.65 }}
              >
                Following
              </button>
            </div>
            <button type="button" className="hud-btn" onClick={() => void refreshFeed()}>
              Refresh
            </button>
          </div>
          <ul className="hud-feed">
            {feed.map((p) => (
              <li key={p.eid}>
                <PostCard
                  post={p}
                  metrics={metrics[p.eid]}
                  onRefreshMetrics={() => void loadMetrics(p.eid)}
                  onFeedRefresh={() => void refreshFeed()}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
