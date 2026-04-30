import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import GridLayout, { type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useAccountProfile } from "../auth/AccountProvider";
import { apiPatchProfile, apiPublicProfile } from "../api/relayAccounts";
import type { AccountProfile } from "../types/account";
import { PostComposer } from "../components/PostComposer";
import { PostCard, type FeedPost, type PostMetrics } from "../components/PostCard";
import { feedUrl } from "../api/feed";
import { RELAY } from "../config";

function toLayoutItems(layout: Layout[]) {
  return layout.map((l) => ({
    i: l.i,
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
    minW: l.minW,
    minH: l.minH,
  }));
}

export function UserHomePage() {
  const { handle } = useParams<{ handle: string }>();
  const h = (handle ?? "").toLowerCase();
  const { profile: me, token } = useAccountProfile();
  const [pub, setPub] = useState<AccountProfile | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [metrics, setMetrics] = useState<Record<string, PostMetrics | undefined>>({});
  const [width, setWidth] = useState(900);
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = me?.handle === h;

  useEffect(() => {
    const ro = () => setWidth(Math.min(920, Math.max(320, window.innerWidth - 40)));
    ro();
    window.addEventListener("resize", ro);
    return () => window.removeEventListener("resize", ro);
  }, []);

  useEffect(() => {
    void (async () => {
      if (!h) return;
      setPub(null);
      setProfileMissing(false);
      const p = await apiPublicProfile(h);
      if (!p) setProfileMissing(true);
      else setPub(p);
    })();
  }, [h]);

  const refreshFeed = useCallback(async () => {
    if (!h) return;
    const r = await fetch(feedUrl(h));
    if (r.ok) setFeed(await r.json());
  }, [h]);

  useEffect(() => {
    void refreshFeed();
  }, [refreshFeed]);

  const loadMetrics = async (eid: string) => {
    const r = await fetch(`${RELAY}/v1/metrics/${eid}`);
    if (!r.ok) return;
    const m = (await r.json()) as PostMetrics;
    setMetrics((prev) => ({ ...prev, [eid]: m }));
  };

  if (!h) return <div className="hud-alert">Missing handle</div>;
  if (profileMissing) {
    return (
      <div className="hud-panel">
        <div className="hud-label">Profile</div>
        <p>No DirecT profile @{h}.</p>
      </div>
    );
  }
  if (!pub) return <div className="hud-panel">Loading…</div>;

  const layoutItems = pub.layout.items;
  const cols = pub.layout.cols;
  const rowHeight = pub.layout.rowHeight;

  const onLayoutChange = (layout: Layout[]) => {
    if (!isOwner || !token) return;
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      void apiPatchProfile(token, {
        layout: {
          cols: pub.layout.cols,
          rowHeight: pub.layout.rowHeight,
          items: toLayoutItems(layout),
        },
      })
        .then(setPub)
        .catch(() => undefined);
    }, 500);
  };

  return (
    <div>
      {isOwner ? (
        <p style={{ fontSize: 12, color: "var(--hud-dim)", margin: "0 0 12px" }}>
          Drag the top strip of a tile to move your layout. Resize from corners.
        </p>
      ) : null}
      <section className="hud-panel">
        <div className="hud-label">Profile</div>
        <h1 style={{ margin: "6px 0 0", fontSize: 22 }}>{pub.displayName}</h1>
        <p style={{ color: "var(--hud-dim)", margin: "6px 0 0" }}>
          @{pub.handle}
          {pub.profession ? ` · ${pub.profession}` : null}
          {pub.location ? ` · ${pub.location}` : null}
        </p>
        <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{pub.bio}</p>
      </section>

      <GridLayout
        className="layout"
        width={width}
        cols={cols}
        rowHeight={rowHeight}
        margin={[10, 10]}
        containerPadding={[0, 0]}
        layout={layoutItems.map((x) => ({ ...x }))}
        onLayoutChange={onLayoutChange}
        isDraggable={Boolean(isOwner)}
        isResizable={Boolean(isOwner)}
        draggableHandle=".hud-grid-drag"
        draggableCancel=".hud-composer-embed, textarea, input, button, select, .hud-link, video"
      >
        <div key="about" className="hud-panel">
          {isOwner ? <div className="hud-grid-drag" role="presentation" /> : null}
          <div className="hud-label">About</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{pub.about || "—"}</div>
        </div>
        <div key="links" className="hud-panel">
          {isOwner ? <div className="hud-grid-drag" role="presentation" /> : null}
          <div className="hud-label">Links</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {Object.entries(pub.socialLinks).map(([k, v]) =>
              v ? (
                <li key={k} style={{ marginBottom: 6 }}>
                  <a className="hud-link" href={v} target="_blank" rel="noreferrer">
                    {k}
                  </a>
                </li>
              ) : null,
            )}
          </ul>
          {Object.values(pub.socialLinks).every((x) => !x) ? <div style={{ color: "var(--hud-dim)" }}>No links yet.</div> : null}
        </div>
        <div key="feed" className="hud-panel">
          {isOwner ? <div className="hud-grid-drag" role="presentation" /> : null}
          <div className="hud-label">Posts on this page</div>
          <button type="button" className="hud-btn" style={{ marginBottom: 10 }} onClick={() => void refreshFeed()}>
            Refresh
          </button>
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
        </div>
        <div key="composer" className="hud-panel">
          {isOwner ? (
            <>
              <div className="hud-grid-drag" role="presentation" />
              <PostComposer embedded directHandle={pub.handle} onPosted={() => void refreshFeed()} />
            </>
          ) : (
            <>
              <div className="hud-label">Composer</div>
              <div style={{ color: "var(--hud-dim)" }}>Only the profile owner can post here.</div>
            </>
          )}
        </div>
      </GridLayout>
    </div>
  );
}
