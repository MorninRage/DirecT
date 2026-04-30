import cors from "cors";
import express from "express";
import multer from "multer";
import { keccak256, type Address, type Hex } from "viem";
import type { SignedEvent } from "./crypto.js";
import { verifySignature, computeEid } from "./crypto.js";
import { isReactionKind, REACTION_KINDS, type ReactionKind } from "./reactionKinds.js";
import {
  assertWalletLinkedToHandle,
  getPublicProfile,
  linkWalletForAccount,
  linkWalletMessage,
  login,
  normalizeHandle,
  registerAccount,
  resolveSession,
  updateProfile,
  type AccountProfile,
} from "./accounts.js";

const PORT = Number(process.env.PORT ?? 8787);
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 84532);
const INDEXER_SECRET = process.env.INDEXER_SECRET ?? "";

type Reactions = Record<ReactionKind, number>;

export type Metrics = {
  views: number;
  shares: number;
  comments: number;
  reactions: Reactions;
};

function emptyReactions(): Reactions {
  const r = {} as Reactions;
  for (const k of REACTION_KINDS) r[k] = 0;
  return r;
}

function defaultMetrics(): Metrics {
  return { views: 0, shares: 0, comments: 0, reactions: emptyReactions() };
}

function mergeMetrics(m: Partial<Metrics> | undefined): Metrics {
  const base = defaultMetrics();
  if (!m) return base;
  const reactions = { ...base.reactions, ...m.reactions };
  for (const k of REACTION_KINDS) if (reactions[k] == null) reactions[k] = 0;
  return {
    views: m.views ?? 0,
    shares: m.shares ?? 0,
    comments: m.comments ?? 0,
    reactions: reactions as Reactions,
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "4mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "direct-relay", chainId: CHAIN_ID });
});

const events = new Map<string, SignedEvent>();
const metrics = new Map<string, Metrics>();
const mediaBlobs = new Map<string, { mime: string; data: Buffer }>();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

function getMetrics(eid: string): Metrics {
  const m = metrics.get(eid);
  const merged = mergeMetrics(m);
  metrics.set(eid, merged);
  return merged;
}

function applyEngagement(parentEid: string, body: Record<string, unknown>) {
  const type = String(body.type ?? "");
  const parent = parentEid.toLowerCase();
  const pm = getMetrics(parent);
  if (type === "share") {
    pm.shares += 1;
    return;
  }
  if (type === "comment") {
    pm.comments += 1;
    return;
  }
  if (type === "reaction") {
    const raw = String(body.reaction ?? "like");
    const kind = isReactionKind(raw) ? raw : "like";
    pm.reactions[kind] += 1;
    return;
  }
  if (type === "like") {
    pm.reactions.like += 1;
    return;
  }
}

app.post("/v1/media", upload.single("file"), (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "file_required" });
    }
    const bytes = new Uint8Array(req.file.buffer);
    const cid = keccak256(bytes).toLowerCase();
    mediaBlobs.set(cid, { mime: req.file.mimetype || "application/octet-stream", data: req.file.buffer });
    return res.status(201).json({ cid, mime: req.file.mimetype, size: req.file.size });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload_failed";
    return res.status(400).json({ error: msg });
  }
});

app.get("/v1/media/:cid", (req, res) => {
  const cid = req.params.cid.toLowerCase();
  const blob = mediaBlobs.get(cid);
  if (!blob) return res.status(404).json({ error: "not_found" });
  res.setHeader("Content-Type", blob.mime);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  return res.send(blob.data);
});

app.post("/v1/events", async (req, res) => {
  try {
    const envelope = req.body as SignedEvent;
    const signer = await verifySignature(CHAIN_ID, envelope);
    const eid = computeEid(envelope);
    const key = eid.toLowerCase();
    if (events.has(key)) {
      return res.status(409).json({ error: "duplicate_eid", eid: key });
    }
    const body = envelope.event.body as Record<string, unknown>;
    const dh = body.direct_handle;
    if (typeof dh === "string" && dh.trim()) {
      assertWalletLinkedToHandle(dh, signer);
    }
    events.set(key, envelope);
    const type = String(body.type ?? "");
    const parentRaw = body.reply_to;
    if (typeof parentRaw === "string" && parentRaw.startsWith("0x")) {
      applyEngagement(parentRaw, body);
    }
    return res.status(201).json({ eid: key, type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid_event";
    const code =
      msg === "wallet_not_linked" || msg === "unknown_handle" || msg === "invalid_handle_field"
        ? 403
        : 400;
    return res.status(code).json({ error: msg });
  }
});

app.get("/v1/events/:eid", (req, res) => {
  const ev = events.get(req.params.eid.toLowerCase());
  if (!ev) return res.status(404).json({ error: "not_found" });
  return res.json(ev);
});

app.get("/v1/authors/:address/events", (req, res) => {
  const addr = req.params.address.toLowerCase();
  const list = [...events.values()]
    .filter((e) => e.event.header.author.toLowerCase() === addr)
    .map((e) => ({ eid: computeEid(e).toLowerCase(), ...e.event.header, body: e.event.body }))
    .sort((a, b) => b.timestamp - a.timestamp);
  return res.json(list);
});

app.get("/v1/feed", (req, res) => {
  const hraw = typeof req.query.handle === "string" ? req.query.handle.trim().toLowerCase() : null;
  const list = [...events.entries()]
    .filter(([, env]) => String((env.event.body as { type?: string }).type ?? "") === "post")
    .filter(([, env]) => {
      if (!hraw) return true;
      const b = env.event.body as { direct_handle?: string };
      return String(b.direct_handle ?? "").toLowerCase() === hraw;
    })
    .map(([eid, env]) => {
      const body = env.event.body as {
        text?: string;
        media?: { cid?: string; mime?: string }[];
        direct_handle?: string;
      };
      const media = Array.isArray(body.media) ? body.media : [];
      return {
        eid,
        timestamp: env.event.header.timestamp,
        author: env.event.header.author,
        schema: env.event.header.schema,
        preview: body.text?.slice(0, 280),
        media,
        direct_handle: body.direct_handle ?? null,
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
  res.json(list);
});

app.post("/v1/events/:eid/view", (req, res) => {
  const auth = req.headers["x-indexer-secret"];
  if (INDEXER_SECRET && auth !== INDEXER_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const m = getMetrics(req.params.eid.toLowerCase());
  const n = Number((req.body as { count?: number })?.count ?? 1);
  m.views += Number.isFinite(n) ? n : 1;
  return res.json(m);
});

app.get("/v1/metrics/:eid", (req, res) => {
  const eid = req.params.eid.toLowerCase();
  if (!events.has(eid)) return res.status(404).json({ error: "unknown_event" });
  return res.json(getMetrics(eid));
});

function bearer(req: express.Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

function requireAuth(req: express.Request, res: express.Response): string | null {
  const token = bearer(req);
  const handle = resolveSession(token);
  if (!handle) {
    res.status(401).json({ error: "auth_required" });
    return null;
  }
  return handle;
}

app.post("/v1/accounts/register", (req, res) => {
  try {
    const { handle, password, displayName } = req.body as {
      handle?: string;
      password?: string;
      displayName?: string;
    };
    if (typeof password !== "string") return res.status(400).json({ error: "password_required" });
    const profile = registerAccount(
      String(handle ?? ""),
      password,
      displayName ? String(displayName) : undefined,
    );
    const token = login(profile.handle, password);
    return res.status(201).json({ token, profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "register_failed";
    const code = msg === "handle_taken" ? 409 : 400;
    return res.status(code).json({ error: msg });
  }
});

app.post("/v1/accounts/login", (req, res) => {
  try {
    const { handle, password } = req.body as { handle?: string; password?: string };
    if (typeof handle !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "invalid_body" });
    }
    const normalized = normalizeHandle(handle);
    if (!normalized) return res.status(400).json({ error: "invalid_handle" });
    const token = login(handle, password);
    const prof = getPublicProfile(normalized);
    if (!prof) return res.status(500).json({ error: "profile_missing" });
    return res.json({ token, profile: prof });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid_credentials";
    if (msg === "invalid_handle") return res.status(400).json({ error: msg });
    return res.status(401).json({ error: msg });
  }
});

app.get("/v1/accounts/me", (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  const prof = getPublicProfile(handle);
  return res.json(prof);
});

app.patch("/v1/accounts/me", (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  try {
    const patch = req.body as Record<string, unknown>;
    const { password: _pw, ...safe } = patch;
    const prof = updateProfile(handle, safe as Partial<AccountProfile>);
    return res.json(prof);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "update_failed";
    return res.status(400).json({ error: msg });
  }
});

app.get("/v1/accounts/public/:handle", (req, res) => {
  const prof = getPublicProfile(req.params.handle);
  if (!prof) return res.status(404).json({ error: "not_found" });
  return res.json(prof);
});

app.post("/v1/accounts/me/link-wallet", async (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  try {
    const { address, message, signature } = req.body as {
      address?: Address;
      message?: string;
      signature?: Hex;
    };
    if (!address || !message || !signature) return res.status(400).json({ error: "invalid_body" });
    const prof = await linkWalletForAccount(handle, address, message, signature);
    return res.json(prof);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "link_failed";
    return res.status(400).json({ error: msg });
  }
});

app.get("/v1/link-wallet/challenge", (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  const ts = Date.now();
  return res.json({ message: linkWalletMessage(handle, ts), timestamp: ts });
});

app.get("/v1/posts/:eid/comments", (req, res) => {
  const pid = req.params.eid.toLowerCase();
  if (!events.has(pid)) return res.status(404).json({ error: "unknown_post" });
  const list = [...events.values()]
    .filter((e) => {
      const b = e.event.body as { type?: string; reply_to?: string };
      return String(b.type ?? "") === "comment" && String(b.reply_to ?? "").toLowerCase() === pid;
    })
    .map((e) => ({
      eid: computeEid(e).toLowerCase(),
      author: e.event.header.author,
      timestamp: e.event.header.timestamp,
      text: String((e.event.body as { text?: string }).text ?? ""),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  return res.json(list);
});

app.get("/v1/accounts/me/notifications", (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  const prof = getPublicProfile(handle);
  if (!prof) return res.status(404).json({ error: "not_found" });

  const linked = new Set(prof.linkedWallets.map((a) => a.toLowerCase()));
  const myPostEids = new Set<string>();
  for (const [eid, env] of events) {
    const b = env.event.body as { type?: string; direct_handle?: string };
    if (String(b.type ?? "") !== "post") continue;
    const author = env.event.header.author.toLowerCase();
    const dh = String(b.direct_handle ?? "").toLowerCase();
    if (linked.has(author) || dh === prof.handle.toLowerCase()) {
      myPostEids.add(eid.toLowerCase());
    }
  }

  type NotifItem = {
    id: string;
    kind: string;
    postEid: string;
    actor: string;
    summary: string;
    at: number;
    directHandle: string | null;
  };
  const items: NotifItem[] = [];

  for (const [childEid, env] of events) {
    const b = env.event.body as {
      type?: string;
      reply_to?: string;
      text?: string;
      reaction?: string;
    };
    const rt = typeof b.reply_to === "string" ? b.reply_to.toLowerCase() : "";
    if (!rt || !myPostEids.has(rt)) continue;
    const t = String(b.type ?? "");
    if (t !== "comment" && t !== "reaction" && t !== "share") continue;
    const actor = env.event.header.author.toLowerCase();
    if (linked.has(actor)) continue;

    const parent = events.get(rt);
    const pb = parent?.event.body as { direct_handle?: string } | undefined;
    const directHandle = pb?.direct_handle ? String(pb.direct_handle) : null;

    let summary = "";
    if (t === "comment") summary = (String(b.text ?? "").trim().slice(0, 120) || "New comment") as string;
    else if (t === "reaction") summary = `Reacted: ${String(b.reaction ?? "like")}`;
    else summary = "Reshared your post";

    items.push({
      id: childEid.toLowerCase(),
      kind: t,
      postEid: rt,
      actor,
      summary,
      at: env.event.header.timestamp,
      directHandle,
    });
  }

  items.sort((a, b) => b.at - a.at);
  return res.json({ items: items.slice(0, 80) });
});

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`DirecT relay listening on http://0.0.0.0:${PORT} (chainId=${CHAIN_ID})`);
});
