import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import GridLayout, { type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useAccountProfile } from "../auth/AccountProvider";
import { apiPatchProfile, apiPublicProfile } from "../api/relayAccounts";
import type { AccountProfile } from "../types/account";
import { PostComposer } from "../components/PostComposer";
import { PostCard, type FeedPost, type PostMetrics } from "../components/PostCard";
import { GridTileFrame } from "../components/GridTileFrame";
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

function profileToGridLayout(pub: AccountProfile): Layout[] {
  return pub.layout.items.map((it) => ({
    i: it.i,
    x: it.x,
    y: it.y,
    w: it.w,
    h: it.h,
    minW: it.minW,
    minH: it.minH,
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
  /** Controlled grid positions — updated on every drag/resize so tiles stay put and peers reflow live. */
  const [gridLayout, setGridLayout] = useState<Layout[] | null>(null);
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedHandle = useRef<string | null>(null);

  const isOwner = me?.handle === h;

  useEffect(() => {
    if (!pub || !isOwner) return;
    if (lastSyncedHandle.current !== h) {
      lastSyncedHandle.current = h;
      setGridLayout(profileToGridLayout(pub));
      return;
    }
    setGridLayout((prev) => (prev === null ? profileToGridLayout(pub) : prev));
  }, [pub, h, isOwner]);

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
      setGridLayout(null);
      lastSyncedHandle.current = null;
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

  const layoutForGrid = useMemo(() => {
    if (!pub) return [];
    if (!isOwner) return profileToGridLayout(pub);
    return gridLayout ?? profileToGridLayout(pub);
  }, [gridLayout, pub, isOwner]);

  const persistLayout = useCallback(
    (layout: Layout[]) => {
      if (!isOwner || !token || !pub) return;
      if (saveT.current) clearTimeout(saveT.current);
      saveT.current = setTimeout(() => {
        void apiPatchProfile(token, {
          layout: {
            cols: pub.layout.cols,
            rowHeight: pub.layout.rowHeight,
            items: toLayoutItems(layout),
          },
        })
          .then((next) => {
            setPub(next);
            setGridLayout(profileToGridLayout(next));
          })
          .catch(() => undefined);
      }, 450);
    },
    [isOwner, token, pub],
  );

  const onLayoutChange = useCallback(
    (next: Layout[]) => {
      if (!isOwner) return;
      if (!next?.length) return;
      setGridLayout(next);
      persistLayout(next);
    },
    [isOwner, persistLayout],
  );

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

  return (
    <div className="hud-home">
      {isOwner ? (
        <div className="hud-home-hint hud-panel hud-panel--hint">
          <div className="hud-home-hint__title">Arrange your page</div>
          <p className="hud-home-hint__text">
            Grab the <strong>colored tile bar</strong> to move blocks — others slide aside automatically. Drag corners or
            edges to resize. Layout is saved to your profile.
          </p>
        </div>
      ) : null}
      <section className="hud-panel hud-panel--hero">
        <div className="hud-label">Profile</div>
        <h1 className="hud-home-title">{pub.displayName}</h1>
        <p className="hud-home-meta">
          @{pub.handle}
          {pub.profession ? ` · ${pub.profession}` : null}
          {pub.location ? ` · ${pub.location}` : null}
        </p>
        <p className="hud-home-bio">{pub.bio}</p>
      </section>

      <GridLayout
        className="layout hud-grid-layout"
        width={width}
        cols={pub.layout.cols}
        rowHeight={pub.layout.rowHeight}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        layout={layoutForGrid}
        onLayoutChange={onLayoutChange}
        compactType="vertical"
        preventCollision={false}
        useCSSTransforms
        isDraggable={Boolean(isOwner)}
        isResizable={Boolean(isOwner)}
        resizeHandles={isOwner ? ["s", "w", "e", "n", "sw", "nw", "se", "ne"] : undefined}
        draggableHandle=".hud-grid-drag"
        draggableCancel=".hud-composer-embed, textarea, input, button, select, .hud-link, a, video, [role='slider']"
      >
        <div key="about" className="hud-panel hud-tile hud-tile--about">
          <GridTileFrame title="About" owner={Boolean(isOwner)} />
          <div className="hud-label">About</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{pub.about || "—"}</div>
        </div>
        <div key="links" className="hud-panel hud-tile hud-tile--links">
          <GridTileFrame title="Links" owner={Boolean(isOwner)} />
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
        <div key="feed" className="hud-panel hud-tile hud-tile--feed">
          <GridTileFrame title="Posts" owner={Boolean(isOwner)} />
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
        <div key="composer" className="hud-panel hud-tile hud-tile--composer">
          {isOwner ? (
            <>
              <GridTileFrame title="Composer" owner />
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
