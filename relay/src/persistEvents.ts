import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SignedEvent } from "./crypto.js";

export type PersistedMetrics = {
  views: number;
  shares: number;
  comments: number;
  reactions: Record<string, number>;
};

const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");
const eventsPath = join(dataDir, "events-state.json");
const mediaDir = join(dataDir, "media");

function safeCidFile(cidRaw: string): string {
  const c = cidRaw.toLowerCase().replace(/^0x/, "");
  if (!/^[a-f0-9]{64}$/.test(c)) throw new Error("invalid_cid");
  return c;
}

export function ensureDataDirs(): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });
}

export function loadEventsFromDisk(
  events: Map<string, SignedEvent>,
  metrics: Map<string, PersistedMetrics>,
): void {
  ensureDataDirs();
  if (!existsSync(eventsPath)) {
    return;
  }
  try {
    const raw = JSON.parse(readFileSync(eventsPath, "utf8")) as {
      events?: [string, SignedEvent][];
      metrics?: [string, PersistedMetrics][];
    };
    events.clear();
    metrics.clear();
    for (const [k, v] of raw.events ?? []) {
      if (k && v?.event?.header && v.signature) events.set(k.toLowerCase(), v);
    }
    for (const [k, v] of raw.metrics ?? []) {
      if (k && v && typeof v === "object") metrics.set(k.toLowerCase(), v);
    }
    console.log(`[relay] loaded ${events.size} events, ${metrics.size} metric rows from ${eventsPath}`);
  } catch (err) {
    console.error("[relay] load events-state failed:", err);
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersistEvents(
  events: Map<string, SignedEvent>,
  metrics: Map<string, PersistedMetrics>,
  delayMs = 400,
): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistEventsNow(events, metrics);
  }, delayMs);
}

export function persistEventsNow(events: Map<string, SignedEvent>, metrics: Map<string, PersistedMetrics>): void {
  try {
    ensureDataDirs();
    const payload = {
      events: [...events.entries()],
      metrics: [...metrics.entries()],
    };
    writeFileSync(eventsPath, JSON.stringify(payload), "utf8");
  } catch (err) {
    console.error("[relay] persist events-state failed:", err);
  }
}

/** Write uploaded media to disk so survives process restarts. */
export function persistMediaBlob(cid: string, mime: string, data: Buffer): void {
  ensureDataDirs();
  const base = safeCidFile(cid);
  writeFileSync(join(mediaDir, `${base}.bin`), data);
  writeFileSync(join(mediaDir, `${base}.mime`), mime, "utf8");
}

export function loadMediaBlobFromDisk(cid: string): { mime: string; data: Buffer } | null {
  try {
    const base = safeCidFile(cid);
    const binPath = join(mediaDir, `${base}.bin`);
    const mimePath = join(mediaDir, `${base}.mime`);
    if (!existsSync(binPath)) return null;
    const data = readFileSync(binPath);
    const mime = existsSync(mimePath) ? readFileSync(mimePath, "utf8").trim() : "application/octet-stream";
    return { mime, data };
  } catch {
    return null;
  }
}
