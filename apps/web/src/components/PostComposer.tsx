import { useState } from "react";
import type { Address } from "viem";
import { useAccountProfile } from "../auth/AccountProvider";
import { useDirectAuth } from "../auth/DirectAuthProvider";
import { RELAY } from "../config";
import type { EventHeader } from "../eip712";
import { uploadMedia, submitEvent } from "../lib/submitEvent";

export function PostComposer({
  onPosted,
  directHandle,
  embedded = false,
}: {
  onPosted: () => void;
  /** When set, post includes `direct_handle` (relay checks wallet linkage). */
  directHandle?: string;
  /** Omit outer `hud-panel` when nested inside another panel (e.g. homepage grid). */
  embedded?: boolean;
}) {
  const { address, signEnvelope } = useDirectAuth();
  const { profile } = useAccountProfile();
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [video, setVideo] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);

  const handleForPost =
    directHandle ??
    (profile && address && profile.linkedWallets.map((a) => a.toLowerCase()).includes(address.toLowerCase())
      ? profile.handle
      : undefined);

  const hasMedia = Boolean(video) || images.length > 0;
  const canPublish = Boolean(address && (text.trim() || hasMedia));

  const publish = async () => {
    if (!address || !canPublish) return;
    setBusy(true);
    setStatus("");
    try {
      const media: { cid: string; mime: string; size: number }[] = [];
      for (const file of images) {
        setStatus("Uploading images…");
        const up = await uploadMedia(file);
        media.push({ cid: up.cid, mime: up.mime, size: file.size });
      }
      if (video) {
        setStatus("Uploading video…");
        const up = await uploadMedia(video);
        media.push({ cid: up.cid, mime: up.mime, size: video.size });
      }
      const body: Record<string, unknown> = {
        type: "post",
        schema: "direct.post.v1",
        text: text.trim(),
        media,
        reply_to: null,
        created_at: new Date().toISOString(),
      };
      if (handleForPost) body.direct_handle = handleForPost;
      const header: EventHeader = {
        author: address as Address,
        schema: "direct.post.v1",
        timestamp: Math.floor(Date.now() / 1000),
        nonce: crypto.randomUUID(),
        prev_eid: null,
      };
      setStatus("Sign & publish…");
      const payload = await signEnvelope(header, body);
      await submitEvent(payload);
      setText("");
      setVideo(null);
      setImages([]);
      setStatus("Published.");
      onPosted();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inner = (
    <>
      <div className="hud-label">Composer</div>
      {!address ? (
        <div className="hud-alert" style={{ marginBottom: 8 }}>
          Connect a <strong>signing wallet</strong> (top bar → Wallet) to publish from here.
        </div>
      ) : null}
      {handleForPost ? (
        <div className="hud-mono" style={{ marginBottom: 8, fontSize: 12 }}>
          Posting as @{handleForPost} (wallet must be linked on the Wallet link page).
        </div>
      ) : address ? (
        <div style={{ fontSize: 12, color: "var(--hud-dim)", marginBottom: 8 }}>
          This post won’t carry a profile handle until you link your signing wallet from the Wallet link page.
        </div>
      ) : null}
      <textarea
        className="hud-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a post… (optional if you attach media)"
      />
      <div style={{ marginTop: 10 }}>
        <div className="hud-label">Photos</div>
        <input
          className="hud-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setImages(e.target.files?.length ? Array.from(e.target.files) : [])}
        />
        {images.length ? (
          <div className="hud-mono" style={{ marginTop: 6 }}>
            {images.length} file{images.length === 1 ? "" : "s"} selected
          </div>
        ) : null}
      </div>
      <div style={{ marginTop: 10 }}>
        <div className="hud-label">Video</div>
        <input
          className="hud-input"
          type="file"
          accept="video/*"
          onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
        />
        {video ? <div className="hud-mono" style={{ marginTop: 6 }}>{video.name}</div> : null}
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="hud-btn hud-btn--primary" disabled={busy || !canPublish} onClick={() => void publish()}>
          Publish
        </button>
        {status ? <span className="hud-mono">{status}</span> : null}
      </div>
      <div className="hud-token-note">Media is stored on the relay for this MVP ({RELAY}).</div>
    </>
  );

  if (embedded) {
    return <div className="hud-composer-embed">{inner}</div>;
  }

  return <section className="hud-panel">{inner}</section>;
}
