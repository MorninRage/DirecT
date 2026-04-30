import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? Math.max(320, window.innerWidth - 32) : 1200,
  );
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

  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!pub) return;
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setWidth(Math.max(280, Math.floor(w)));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [pub]);
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
    <div ref={containerRef} className="hud-home hud-home-layout">
      {isOwner ? (
        <div className="hud-home-hint hud-panel hud-panel--hint">
          <div className="hud-home-hint__title">Arrange your page</div>
          <p className="hud-home-hint__text">
            The grid uses the <strong>full width of your window</strong> — you can dock tiles to the far left or right.
            Grab the <strong>colored tile bar</strong> to move blocks (others reflow). Drag corners or edges to resize.
            Layout is saved to your profile.
          </p>
        </div>
      ) : null}
      <section
        className="hud-panel hud-panel--hero"
        style={{
          position: "relative",
          overflow: "hidden",
          ...(pub.coverCid
            ? {
                backgroundImage: `linear-gradient(rgba(6,10,18,0.82), rgba(6,10,18,0.92)), url(${RELAY}/v1/media/${pub.coverCid})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : {}),
        }}
      >
        <div className="hud-label">Profile</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          {pub.avatarCid ? (
            <img
              src={`${RELAY}/v1/media/${pub.avatarCid}`}
              alt=""
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid rgba(126,203,255,0.35)",
                flexShrink: 0,
              }}
            />
          ) : null}
          <div>
            <h1 className="hud-home-title" style={{ margin: "0 0 4px" }}>
              {pub.displayName}
            </h1>
            <p className="hud-home-meta" style={{ margin: 0 }}>
              @{pub.handle}
              {pub.profession ? ` · ${pub.profession}` : null}
              {pub.location ? ` · ${pub.location}` : null}
            </p>
          </div>
        </div>
        <p className="hud-home-bio" style={{ marginTop: 12 }}>
          {pub.bio}
        </p>
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
        draggableCancel=".hud-composer-embed, textarea, input, button, select, .hud-link, a, video, img, [role='slider']"
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
