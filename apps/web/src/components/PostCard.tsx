import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Address } from "viem";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { useAccountProfile } from "../auth/AccountProvider";
import { RELAY } from "../config";
import type { EventHeader } from "../eip712";
import { submitEvent } from "../lib/submitEvent";
import { ReactionStrip } from "./ReactionStrip";
import { formatReactionMetricLine, type Emotion } from "../reactions";

export type FeedPost = {
  eid: string;
  timestamp: number;
  author: string;
  schema: string;
  preview?: string;
  media?: { cid?: string; mime?: string }[];
  direct_handle?: string | null;
  repost_of?: string | null;
  original?: {
    eid: string;
    preview?: string;
    media?: { cid?: string; mime?: string }[];
    author: string;
    direct_handle: string | null;
  } | null;
};

export type PostMetrics = {
  views: number;
  shares: number;
  comments: number;
  reactions: Record<string, number>;
};

type CommentRow = {
  eid: string;
  author: string;
  timestamp: number;
  text: string;
  direct_handle?: string | null;
};

function profilePathFor(handle: string | null | undefined, author: string) {
  return handle ? `/u/${handle}` : `/direct/${author}`;
}

function PostMedia({
  media,
}: {
  media: { cid?: string; mime?: string }[] | undefined;
}) {
  const list = media ?? [];
  const video = list.find((m) => m.mime?.startsWith("video/") && m.cid);
  const images = list.filter((m) => m.mime?.startsWith("image/") && m.cid);
  return (
    <>
      {images.map((m, i) => (
        <img
          key={`${m.cid}-${i}`}
          className="hud-post-image"
          src={`${RELAY}/v1/media/${m.cid}`}
          alt=""
          style={{ maxWidth: "100%", borderRadius: 8, marginTop: 8, display: "block" }}
        />
      ))}
      {video?.cid ? (
        <video className="hud-video" controls src={`${RELAY}/v1/media/${video.cid}`} style={{ marginTop: images.length ? 8 : 0 }} />
      ) : null}
    </>
  );
}

export function PostCard({
  post,
  metrics,
  onRefreshMetrics,
  onFeedRefresh,
}: {
  post: FeedPost;
  metrics?: PostMetrics;
  onRefreshMetrics: () => void;
  onFeedRefresh: () => void;
}) {
  const { address, signEnvelope } = useDirectAuth();
  const { profile } = useAccountProfile();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");

  const profilePath = post.direct_handle ? `/u/${post.direct_handle}` : `/direct/${post.author}`;
  const reshareHandle =
    profile && address && profile.linkedWallets.some((a) => a.toLowerCase() === address.toLowerCase())
      ? profile.handle
      : null;
  const commentHandle = reshareHandle;

  const loadComments = async () => {
    const r = await fetch(`${RELAY}/v1/posts/${post.eid}/comments`);
    if (r.ok) setComments(await r.json());
  };

  useEffect(() => {
    if (showComments) void loadComments();
  }, [showComments, post.eid]);

  const sendChild = async (type: string, extra: Record<string, unknown>) => {
    if (!address) throw new Error("Connect a signing wallet first.");
    const body = {
      type,
      schema: `direct.${type}.v1`,
      reply_to: post.eid,
      created_at: new Date().toISOString(),
      ...extra,
    };
    const header: EventHeader = {
      author: address as Address,
      schema: String(body.schema),
      timestamp: Math.floor(Date.now() / 1000),
      nonce: crypto.randomUUID(),
      prev_eid: null,
    };
    const payload = await signEnvelope(header, body);
    await submitEvent(payload);
  };

  const onReact = async (emotion: Emotion) => {
    try {
      await sendChild("reaction", { reaction: emotion });
      await onRefreshMetrics();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onReshare = async () => {
    if (!address) return;
    if (!reshareHandle) {
      alert(
        "Link your signing wallet to your profile on the Wallet link page to reshare — your repost will appear on My page and in the network feed.",
      );
      return;
    }
    try {
      const body: Record<string, unknown> = {
        type: "repost",
        schema: "direct.repost.v1",
        repost_of: post.repost_of && post.original ? post.repost_of : post.eid,
        text: "",
        media: [],
        reply_to: null,
        created_at: new Date().toISOString(),
        direct_handle: reshareHandle,
      };
      const header: EventHeader = {
        author: address as Address,
        schema: "direct.repost.v1",
        timestamp: Math.floor(Date.now() / 1000),
        nonce: crypto.randomUUID(),
        prev_eid: null,
      };
      const payload = await signEnvelope(header, body);
      await submitEvent(payload);
      await onRefreshMetrics();
      await onFeedRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onView = async () => {
    await fetch(`${RELAY}/v1/events/${post.eid}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: 1 }),
    });
    await onRefreshMetrics();
  };

  const onComment = async () => {
    if (!commentText.trim()) return;
    try {
      const extra: Record<string, unknown> = { text: commentText.trim() };
      if (commentHandle) extra.direct_handle = commentHandle;
      await sendChild("comment", extra);
      setCommentText("");
      await loadComments();
      await onRefreshMetrics();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onDeletePost = async () => {
    if (!address) return;
    if (address.toLowerCase() !== post.author.toLowerCase()) return;
    if (!window.confirm("Remove this post from feeds? This cannot be undone on the relay.")) return;
    try {
      const body: Record<string, unknown> = {
        type: "post_delete",
        schema: "direct.post_delete.v1",
        target_eid: post.eid,
        created_at: new Date().toISOString(),
      };
      const header: EventHeader = {
        author: address as Address,
        schema: "direct.post_delete.v1",
        timestamp: Math.floor(Date.now() / 1000),
        nonce: crypto.randomUUID(),
        prev_eid: null,
      };
      const payload = await signEnvelope(header, body);
      await submitEvent(payload);
      await onFeedRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const summary = metrics ? formatReactionMetricLine(metrics.reactions) : null;

  const orig = post.original;
  const isRepost = Boolean(post.repost_of && orig);
  const hasMedia = Boolean(post.media?.some((m) => m.cid));
  const canDelete = Boolean(address && post.author.toLowerCase() === address.toLowerCase());

  return (
    <article className="hud-post">
      <div className="hud-post-meta">
        <Link className="hud-link" to={profilePath}>
          {post.direct_handle ? `@${post.direct_handle}` : `${post.author.slice(0, 6)}…${post.author.slice(-4)}`}
        </Link>
        <span>{new Date(post.timestamp * 1000).toLocaleString()}</span>
      </div>

      {isRepost ? (
        <>
          {post.preview ? (
            <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{post.preview}</p>
          ) : (
            <p style={{ margin: "6px 0 0", color: "var(--hud-dim)", fontSize: 13 }}>Reshared</p>
          )}
          <div
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 10,
              border: "1px solid rgba(126,203,255,0.25)",
              background: "rgba(0,0,0,0.2)",
            }}
          >
            <div className="hud-label" style={{ marginBottom: 6 }}>
              Original
            </div>
            {orig ? (
              <>
                <div className="hud-mono" style={{ fontSize: 12, marginBottom: 6 }}>
                  <Link className="hud-link" to={profilePathFor(orig.direct_handle, orig.author)}>
                    {orig.direct_handle ? `@${orig.direct_handle}` : `${orig.author.slice(0, 6)}…${orig.author.slice(-4)}`}
                  </Link>
                </div>
                {orig.preview ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{orig.preview}</p> : null}
                <PostMedia media={orig.media} />
              </>
            ) : (
              <div style={{ color: "var(--hud-dim)" }}>Original post is not available on this relay.</div>
            )}
          </div>
        </>
      ) : (
        <>
          {post.preview ? (
            <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{post.preview}</p>
          ) : hasMedia ? null : (
            <p style={{ margin: "6px 0 0", color: "var(--hud-dim)" }}>(no text)</p>
          )}
          <PostMedia media={post.media} />
        </>
      )}

      {metrics ? (
        <div className="hud-post-metrics hud-mono" style={{ marginTop: 10, fontSize: 11, color: "var(--hud-dim)" }}>
          views {metrics.views} · shares {metrics.shares} · comments {metrics.comments}
          {summary ? <> · {summary}</> : null}
        </div>
      ) : null}

      <div className="hud-label" style={{ marginTop: 10 }}>
        Impressions
      </div>
      <ReactionStrip disabled={!address} onReact={(e) => void onReact(e)} />

      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="hud-btn" disabled={!address} onClick={() => void onView()}>
          Register view
        </button>
        <button type="button" className="hud-btn hud-btn--primary" disabled={!address} onClick={() => void onReshare()}>
          Reshare
        </button>
        <button type="button" className="hud-btn" onClick={() => void onRefreshMetrics()}>
          Scan metrics
        </button>
        <button type="button" className="hud-btn" onClick={() => setShowComments((v) => !v)}>
          {showComments ? "Hide comments" : "Comments"}
        </button>
        {canDelete ? (
          <button type="button" className="hud-btn" onClick={() => void onDeletePost()}>
            Delete post
          </button>
        ) : null}
      </div>

      {showComments ? (
        <div style={{ marginTop: 10 }}>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 10px", display: "grid", gap: 8 }}>
            {comments.map((c) => (
              <li key={c.eid} style={{ fontSize: 13, borderLeft: "2px solid rgba(126,203,255,0.35)", paddingLeft: 8 }}>
                <div style={{ color: "var(--hud-dim)" }}>
                  {c.direct_handle ? (
                    <Link className="hud-link" to={`/u/${c.direct_handle}`}>
                      @{c.direct_handle}
                    </Link>
                  ) : (
                    <span className="hud-mono">
                      {c.author.slice(0, 6)}…{c.author.slice(-4)}
                    </span>
                  )}{" "}
                  · {new Date(c.timestamp * 1000).toLocaleString()}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{c.text}</div>
              </li>
            ))}
          </ul>
          <textarea
            className="hud-textarea"
            style={{ minHeight: 72 }}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write a comment…"
          />
          <div style={{ marginTop: 8 }}>
            <button type="button" className="hud-btn hud-btn--primary" disabled={!address || !commentText.trim()} onClick={() => void onComment()}>
              Post comment
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
