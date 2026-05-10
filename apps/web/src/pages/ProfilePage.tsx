import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PostCard, type FeedPost } from "../components/PostCard";
import { RELAY } from "../config";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { useAccountProfile } from "../auth/AccountProvider";
import { SigningWalletSection } from "../components/SigningWalletSection";

type Metrics = { views: number; shares: number; comments: number; reactions: Record<string, number> };

type AuthorRow = { eid: string; timestamp: number; author: string; schema: string; body: Record<string, unknown> };

export function ProfilePage() {
  const { addr } = useParams<{ addr: string }>();
  const addressParam = (addr ?? "").toLowerCase();
  const { address } = useDirectAuth();
  const { profile, token } = useAccountProfile();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});

  const refresh = useCallback(async () => {
    if (!addressParam) return;
    const r = await fetch(`${RELAY}/v1/authors/${addressParam}/events`);
    if (!r.ok) return;
    const rows = (await r.json()) as AuthorRow[];
    const mapped: FeedPost[] = rows
      .filter((row) => String(row.body?.type ?? "") === "post")
      .map((row) => ({
        eid: row.eid,
        timestamp: row.timestamp,
        author: row.author,
        schema: row.schema,
        preview: String(row.body.text ?? "").slice(0, 280),
        media: (row.body.media as FeedPost["media"]) ?? [],
      }));
    setPosts(mapped);
  }, [addressParam]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadMetrics = async (eid: string) => {
    const r = await fetch(`${RELAY}/v1/metrics/${eid}`);
    if (!r.ok) return;
    const m = (await r.json()) as Metrics;
    setMetrics((prev) => ({ ...prev, [eid]: m }));
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const pageLink = `${origin}/direct/${addressParam}`;

  const isSelf = address?.toLowerCase() === addressParam;

  return (
    <>
      {token && profile && isSelf ? <SigningWalletSection /> : null}
      <section className="hud-panel">
        <div className="hud-label">Wallet link</div>
        <h1 style={{ margin: "6px 0", fontSize: 20, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Share URL
        </h1>
        <p className="hud-mono">{pageLink}</p>
        <button
          type="button"
          className="hud-btn"
          style={{ marginTop: 10 }}
          onClick={() => navigator.clipboard.writeText(pageLink).catch(() => undefined)}
        >
          Copy link
        </button>
        {isSelf && profile ? (
          <p style={{ marginTop: 14, color: "var(--hud-dim)", lineHeight: 1.55 }}>
            This page is for sharing your address. <strong>Write posts on </strong>
            <Link className="hud-link" to={`/u/${profile.handle}`}>
              My page (@{profile.handle})
            </Link>
            .
          </p>
        ) : isSelf ? (
          <p style={{ marginTop: 14, color: "var(--hud-dim)", lineHeight: 1.55 }}>
            This page is for sharing your address. <strong>Sign in</strong> and open <strong>My page</strong> to write posts.
          </p>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <Link className="hud-link" to="/">
            ← Back to feed
          </Link>
        </div>
      </section>
      <section className="hud-panel">
        <div className="hud-label">Posts from this address</div>
        <ul className="hud-feed">
          {posts.map((p) => (
            <li key={p.eid}>
              <PostCard
                post={p}
                metrics={metrics[p.eid]}
                onRefreshMetrics={() => void loadMetrics(p.eid)}
                onFeedRefresh={() => void refresh()}
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
