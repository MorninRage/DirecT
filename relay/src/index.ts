import cors from "cors";
import express from "express";
import multer from "multer";
import { formatEther, keccak256, type Address, type Hex } from "viem";
import type { SignedEvent } from "./crypto.js";
import { verifySignature, computeEid } from "./crypto.js";
import { isReactionKind, REACTION_KINDS, type ReactionKind } from "./reactionKinds.js";
import {
  assertWalletLinkedToHandle,
  followAccount,
  getPublicProfile,
  linkWalletForAccount,
  linkWalletMessage,
  listFollowersOf,
  listFollowingOf,
  listIndexerAccountSlice,
  login,
  normalizeHandle,
  registerAccount,
  resolveSession,
  unfollowAccount,
  updateProfile,
  type AccountProfile,
} from "./accounts.js";
import {
  loadEventsFromDisk,
  loadMediaBlobFromDisk,
  persistEventsNow,
  persistMediaBlob,
  schedulePersistEvents,
} from "./persistEvents.js";
import { addPublishedRewardEpoch, getLatestRewardEpoch, loadRewardEpochs, type PublishedRewardEpoch } from "./rewardsEpochs.js";
import {
  assertRootActiveAndNotClaimed,
  loadSponsoredClaimConfig,
  pickBeneficiaryForClaim,
  sponsoredClaimEnvDiagnostics,
  submitSponsoredClaim,
} from "./sponsoredClaim.js";
import { listRecentFollowsForTarget } from "./followActivity.js";

const PORT = Number(process.env.PORT ?? 8787);
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 84532);
const INDEXER_SECRET = process.env.INDEXER_SECRET ?? "";

function dirHumanLabel(amountWei: string): string {
  try {
    return `${formatEther(BigInt(amountWei))} DIR`;
  } catch {
    return `${amountWei} wei (invalid amount)`;
  }
}

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
  const diag = sponsoredClaimEnvDiagnostics();
  res.json({
    ok: true,
    service: "direct-relay",
    chainId: CHAIN_ID,
    sponsoredClaim: Boolean(loadSponsoredClaimConfig()),
    sponsoredClaimDiagnostics: diag,
  });
});

const events = new Map<string, SignedEvent>();
const metrics = new Map<string, Metrics>();
const mediaBlobs = new Map<string, { mime: string; data: Buffer }>();
/** Target post/repost eids removed from public feeds (via signed `post_delete` events). */
const deletedPostEids = new Set<string>();

function rebuildDeletedPostEids(): void {
  deletedPostEids.clear();
  for (const env of events.values()) {
    const b = env.event.body as { type?: string; target_eid?: string };
    if (String(b.type ?? "") !== "post_delete") continue;
    const t = typeof b.target_eid === "string" ? b.target_eid.toLowerCase() : "";
    if (t.startsWith("0x")) deletedPostEids.add(t);
  }
}

function isPostDeleted(eid: string): boolean {
  return deletedPostEids.has(eid.toLowerCase());
}

loadEventsFromDisk(events, metrics);
rebuildDeletedPostEids();
loadRewardEpochs();

process.on("SIGTERM", () => {
  persistEventsNow(events, metrics);
  process.exit(0);
});

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
    try {
      persistMediaBlob(cid, req.file.mimetype || "application/octet-stream", req.file.buffer);
    } catch (persistErr) {
      console.error("[relay] media disk persist failed:", persistErr);
    }
    return res.status(201).json({ cid, mime: req.file.mimetype, size: req.file.size });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upload_failed";
    return res.status(400).json({ error: msg });
  }
});

app.get("/v1/media/:cid", (req, res) => {
  const cid = req.params.cid.toLowerCase();
  const blob = mediaBlobs.get(cid);
  if (blob) {
    res.setHeader("Content-Type", blob.mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(blob.data);
  }
  const fromDisk = loadMediaBlobFromDisk(cid);
  if (fromDisk) {
    mediaBlobs.set(cid, fromDisk);
    res.setHeader("Content-Type", fromDisk.mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.send(fromDisk.data);
  }
  return res.status(404).json({ error: "not_found" });
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
    const type = String(body.type ?? "");

    if (type === "post_delete") {
      const target = String(body.target_eid ?? "").toLowerCase();
      if (!target.startsWith("0x")) {
        return res.status(400).json({ error: "invalid_target_eid" });
      }
      const parent = events.get(target);
      if (!parent) {
        return res.status(400).json({ error: "unknown_target_post" });
      }
      const pb = parent.event.body as { type?: string };
      const pt = String(pb.type ?? "");
      if (pt !== "post" && pt !== "repost") {
        return res.status(400).json({ error: "invalid_delete_target" });
      }
      if (parent.event.header.author.toLowerCase() !== signer.toLowerCase()) {
        return res.status(403).json({ error: "not_post_author" });
      }
    }

    const dh = body.direct_handle;
    if (typeof dh === "string" && dh.trim()) {
      assertWalletLinkedToHandle(dh, signer);
    }
    events.set(key, envelope);
    if (type === "post_delete") {
      const target = String(body.target_eid ?? "").toLowerCase();
      deletedPostEids.add(target);
    }
    const parentRaw = body.reply_to;
    if (typeof parentRaw === "string" && parentRaw.startsWith("0x")) {
      applyEngagement(parentRaw, body);
    }
    if (type === "repost") {
      const ro = body.repost_of;
      if (typeof ro === "string" && ro.startsWith("0x")) {
        applyEngagement(ro, { type: "share" });
      }
    }
    schedulePersistEvents(events, metrics);
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
  const raw = req.params.eid.toLowerCase();
  if (isPostDeleted(raw)) return res.status(404).json({ error: "not_found" });
  const ev = events.get(raw);
  if (!ev) return res.status(404).json({ error: "not_found" });
  return res.json(ev);
});

app.get("/v1/authors/:address/events", (req, res) => {
  const addr = req.params.address.toLowerCase();
  const list = [...events.values()]
    .filter((e) => {
      if (e.event.header.author.toLowerCase() !== addr) return false;
      const eid = computeEid(e).toLowerCase();
      const b = e.event.body as { type?: string };
      const t = String(b.type ?? "");
      if (t === "post_delete") return false;
      if ((t === "post" || t === "repost") && isPostDeleted(eid)) return false;
      return true;
    })
    .map((e) => ({ eid: computeEid(e).toLowerCase(), ...e.event.header, body: e.event.body }))
    .sort((a, b) => b.timestamp - a.timestamp);
  return res.json(list);
});

function originalFeedSnapshot(origEidRaw: string):
  | {
      eid: string;
      preview?: string;
      media: { cid?: string; mime?: string }[];
      author: string;
      direct_handle: string | null;
    }
  | null {
  const origEid = origEidRaw.toLowerCase();
  if (isPostDeleted(origEid)) return null;
  const env = events.get(origEid);
  if (!env) return null;
  const body = env.event.body as {
    type?: string;
    text?: string;
    media?: { cid?: string; mime?: string }[];
    direct_handle?: string;
  };
  const media = Array.isArray(body.media) ? body.media : [];
  return {
    eid: origEid,
    preview: body.text?.slice(0, 280),
    media,
    author: env.event.header.author,
    direct_handle: body.direct_handle ?? null,
  };
}

function requireIndexer(req: express.Request, res: express.Response): boolean {
  const auth = req.headers["x-indexer-secret"];
  if (!INDEXER_SECRET) {
    res.status(503).json({ error: "indexer_disabled" });
    return false;
  }
  if (auth !== INDEXER_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

app.get("/v1/indexer/snapshot", (req, res) => {
  if (!requireIndexer(req, res)) return;
  const payload = {
    schema: "direct.indexer.snapshot.v1",
    chainId: CHAIN_ID,
    exportedAtMs: Date.now(),
    events: [...events.entries()],
    metrics: [...metrics.entries()],
    accounts: listIndexerAccountSlice(),
  };
  res.json(payload);
});

app.get("/v1/feed", (req, res) => {
  const hraw = typeof req.query.handle === "string" ? req.query.handle.trim().toLowerCase() : null;
  const scope = typeof req.query.scope === "string" ? req.query.scope : "";
  let followingSet: Set<string> | null = null;
  if (scope === "following") {
    const token = bearer(req);
    const fh = resolveSession(token);
    if (!fh) {
      return res.status(401).json({ error: "auth_required" });
    }
    followingSet = new Set(listFollowingOf(fh));
  }
  const list = [...events.entries()]
    .filter(([eid, env]) => {
      const t = String((env.event.body as { type?: string }).type ?? "");
      if (t !== "post" && t !== "repost") return false;
      return !isPostDeleted(eid);
    })
    .filter(([, env]) => {
      if (!hraw) return true;
      const b = env.event.body as { direct_handle?: string };
      return String(b.direct_handle ?? "").toLowerCase() === hraw;
    })
    .filter(([, env]) => {
      if (!followingSet) return true;
      const b = env.event.body as { direct_handle?: string };
      const dh = String(b.direct_handle ?? "").toLowerCase();
      return Boolean(dh) && followingSet.has(dh);
    })
    .map(([eid, env]) => {
      const body = env.event.body as {
        type?: string;
        text?: string;
        repost_of?: string;
        media?: { cid?: string; mime?: string }[];
        direct_handle?: string;
      };
      const media = Array.isArray(body.media) ? body.media : [];
      const base = {
        eid,
        timestamp: env.event.header.timestamp,
        author: env.event.header.author,
        schema: env.event.header.schema,
        preview: body.text?.slice(0, 280),
        media,
        direct_handle: body.direct_handle ?? null,
        repost_of: null as string | null,
        original: null as ReturnType<typeof originalFeedSnapshot>,
      };
      if (body.type === "repost" && typeof body.repost_of === "string") {
        const ro = body.repost_of.toLowerCase();
        base.repost_of = ro;
        base.original = originalFeedSnapshot(ro);
      }
      return base;
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
  schedulePersistEvents(events, metrics);
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
    if ("coverCid" in patch) {
      patch.headerCid = patch.coverCid;
      delete patch.coverCid;
    }
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

app.post("/v1/accounts/me/follow", (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  try {
    const target = String((req.body as { handle?: string }).handle ?? "");
    const prof = followAccount(handle, target);
    return res.json(prof);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "follow_failed";
    const code =
      msg === "not_found" ? 404 : msg === "cannot_follow_self" ? 400 : msg === "following_limit" ? 400 : 400;
    return res.status(code).json({ error: msg });
  }
});

app.delete("/v1/accounts/me/follow/:handle", (req, res) => {
  const me = requireAuth(req, res);
  if (!me) return;
  try {
    const prof = unfollowAccount(me, req.params.handle);
    return res.json(prof);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unfollow_failed";
    return res.status(400).json({ error: msg });
  }
});

app.get("/v1/accounts/:handle/followers", (req, res) => {
  const h = normalizeHandle(req.params.handle);
  if (!h) return res.status(400).json({ error: "invalid_handle" });
  return res.json({ handles: listFollowersOf(h) });
});

app.get("/v1/accounts/:handle/following", (req, res) => {
  const h = normalizeHandle(req.params.handle);
  if (!h) return res.status(400).json({ error: "invalid_handle" });
  return res.json({ handles: listFollowingOf(h) });
});

app.get("/v1/rewards/epochs/latest", (_req, res) => {
  const ep = getLatestRewardEpoch();
  if (!ep) return res.json({ epoch: null });
  return res.json({ epoch: ep });
});

app.get("/v1/rewards/me", (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  const ep = getLatestRewardEpoch();
  if (!ep || ep.chainId !== CHAIN_ID) {
    return res.json({ eligible: false, epoch: null });
  }
  const prof = getPublicProfile(handle);
  if (!prof) return res.status(404).json({ error: "not_found" });
  const wallets = new Set(prof.linkedWallets.map((a) => a.toLowerCase()));
  const payout = prof.payoutAddress?.toLowerCase();
  if (payout) wallets.add(payout);
  for (const row of ep.allocations) {
    const b = row.beneficiary.toLowerCase();
    if (wallets.has(b)) {
      return res.json({
        eligible: true,
        epochId: ep.id,
        root: ep.root,
        beneficiary: row.beneficiary,
        amountWei: row.amountWei,
        chainId: ep.chainId,
        allocations: ep.allocations,
      });
    }
  }
  return res.json({ eligible: false, epoch: { id: ep.id, root: ep.root, chainId: ep.chainId } });
});

app.post("/v1/rewards/sponsored-claim", async (req, res) => {
  const handle = requireAuth(req, res);
  if (!handle) return;
  const cfg = loadSponsoredClaimConfig();
  if (!cfg) return res.status(503).json({ error: "sponsored_claim_disabled" });

  const ep = getLatestRewardEpoch();
  if (!ep || ep.chainId !== CHAIN_ID) return res.status(400).json({ error: "no_epoch" });

  const prof = getPublicProfile(handle);
  if (!prof) return res.status(404).json({ error: "not_found" });

  const beneficiaryOpt =
    typeof (req.body as { beneficiary?: unknown } | undefined)?.beneficiary === "string"
      ? (req.body as { beneficiary: string }).beneficiary
      : undefined;

  try {
    const { beneficiary, amount, proof } = pickBeneficiaryForClaim(ep, prof, beneficiaryOpt);
    await assertRootActiveAndNotClaimed(cfg, ep.root as `0x${string}`, beneficiary, amount);
    const txHash = await submitSponsoredClaim({
      cfg,
      root: ep.root as `0x${string}`,
      beneficiary,
      amount,
      proof,
    });
    return res.json({ ok: true, txHash });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "not_eligible") return res.status(400).json({ error: "not_eligible" });
    if (msg === "beneficiary_not_in_epoch_for_profile") {
      return res.status(400).json({ error: "beneficiary_not_in_epoch_for_profile" });
    }
    if (msg === "root_mismatch") return res.status(500).json({ error: "epoch_corrupt" });
    if (msg === "root_inactive") return res.status(400).json({ error: "root_inactive" });
    if (msg === "already_claimed") return res.status(409).json({ error: "already_claimed" });
    // eslint-disable-next-line no-console
    console.error("[relay] sponsored-claim failed:", e);
    return res.status(500).json({ error: "send_failed", detail: msg.slice(0, 200) });
  }
});

app.post("/v1/admin/rewards-epochs", (req, res) => {
  if (!requireIndexer(req, res)) return;
  try {
    const body = req.body as PublishedRewardEpoch;
    addPublishedRewardEpoch(body);
    return res.status(201).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid_body";
    return res.status(400).json({ error: msg });
  }
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
      direct_handle: (() => {
        const dh = (e.event.body as { direct_handle?: string }).direct_handle;
        return typeof dh === "string" && dh.trim() ? dh : null;
      })(),
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
    const ty = String(b.type ?? "");
    if (ty !== "post" && ty !== "repost") continue;
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
      repost_of?: string;
      text?: string;
      reaction?: string;
    };
    const t = String(b.type ?? "");
    const actor = env.event.header.author.toLowerCase();
    if (linked.has(actor)) continue;

    if (t === "repost") {
      const ro = typeof b.repost_of === "string" ? b.repost_of.toLowerCase() : "";
      if (!ro || !myPostEids.has(ro)) continue;
      const parent = events.get(ro);
      const pb = parent?.event.body as { direct_handle?: string } | undefined;
      const directHandle = pb?.direct_handle ? String(pb.direct_handle) : null;
      items.push({
        id: childEid.toLowerCase(),
        kind: "repost",
        postEid: ro,
        actor: env.event.header.author,
        summary: "Reshared your post",
        at: env.event.header.timestamp,
        directHandle,
      });
      continue;
    }

    const rt = typeof b.reply_to === "string" ? b.reply_to.toLowerCase() : "";
    if (!rt || !myPostEids.has(rt)) continue;
    if (t !== "comment" && t !== "reaction" && t !== "share") continue;
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
      actor: env.event.header.author,
      summary,
      at: env.event.header.timestamp,
      directHandle,
    });
  }

  for (const row of listRecentFollowsForTarget(prof.handle, 40)) {
    items.push({
      id: `follow-${row.follower}-${row.atMs}`,
      kind: "follow",
      postEid: "-",
      actor: row.follower,
      summary: `@${row.follower} followed you`,
      at: Math.floor(row.atMs / 1000),
      directHandle: row.follower,
    });
  }

  const latest = getLatestRewardEpoch();
  if (latest && latest.chainId === CHAIN_ID) {
    for (const w of prof.linkedWallets) {
      const low = w.toLowerCase();
      const row = latest.allocations.find((a) => a.beneficiary.toLowerCase() === low);
      if (row && BigInt(row.amountWei) > 0n) {
        items.push({
          id: `rewards-${latest.id}-${low}`,
          kind: "rewards_claimable",
          postEid: latest.id,
          actor: "",
          summary: `Rewards epoch ${latest.id}: you can claim ${dirHumanLabel(row.amountWei)} — open Rewards`,
          at: Math.floor(latest.publishedAtMs / 1000),
          directHandle: null,
        });
      }
    }
    const pay = prof.payoutAddress?.toLowerCase();
    if (pay) {
      const row = latest.allocations.find((a) => a.beneficiary.toLowerCase() === pay);
      if (row && BigInt(row.amountWei) > 0n) {
        const id = `rewards-${latest.id}-${pay}`;
        if (!items.some((i) => i.id === id)) {
          items.push({
            id,
            kind: "rewards_claimable",
            postEid: latest.id,
            actor: "",
            summary: `Rewards epoch ${latest.id}: payout address can claim ${dirHumanLabel(row.amountWei)}`,
            at: Math.floor(latest.publishedAtMs / 1000),
            directHandle: null,
          });
        }
      }
    }
  }

  items.sort((a, b) => b.at - a.at);
  return res.json({ items: items.slice(0, 80) });
});

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`DirecT relay listening on http://0.0.0.0:${PORT} (chainId=${CHAIN_ID})`);
});
