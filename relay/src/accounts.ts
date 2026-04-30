import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyMessage, type Address, type Hex } from "viem";

/** Persisted under DATA_DIR (Fly volume: /data; local: relay/data). */
const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");
const statePath = join(dataDir, "relay-state.json");

function persistAccountsState(): void {
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    const now = Date.now();
    const payload = {
      accounts: [...accounts.entries()],
      sessions: [...sessions.entries()].filter(([, s]) => s.exp > now),
    };
    writeFileSync(statePath, JSON.stringify(payload), "utf8");
  } catch (err) {
    console.error("[relay] persist state failed:", err);
  }
}

function loadAccountsState(): void {
  if (!existsSync(statePath)) return;
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8")) as {
      accounts?: [string, StoredAccount][];
      sessions?: [string, { handle: string; exp: number }][];
    };
    accounts.clear();
    sessions.clear();
    const now = Date.now();
    for (const [k, v] of raw.accounts ?? []) {
      if (k && v?.handle && v.passwordSalt && v.passwordHash && v.profile) accounts.set(k, v);
    }
    for (const [k, v] of raw.sessions ?? []) {
      if (k && v?.handle && v.exp > now) sessions.set(k, v);
    }
    console.log(`[relay] loaded ${accounts.size} accounts, ${sessions.size} sessions from ${statePath}`);
  } catch (err) {
    console.error("[relay] load state failed:", err);
  }
}

export type LayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type AccountProfile = {
  handle: string;
  displayName: string;
  bio: string;
  about: string;
  profession: string;
  location: string;
  socialLinks: Record<string, string>;
  settings: {
    compactFeed: boolean;
    showMetricsInline: boolean;
    highContrast: boolean;
    reduceMotion: boolean;
    /** When true, global network feed is visible (after onboarding). */
    communityFeedUnlocked: boolean;
  };
  layout: { cols: number; rowHeight: number; items: LayoutItem[] };
  linkedWallets: string[];
};

export type StoredAccount = {
  handle: string;
  passwordSalt: string;
  passwordHash: string;
  profile: AccountProfile;
};

const sessions = new Map<string, { handle: string; exp: number }>();
const accounts = new Map<string, StoredAccount>();

const SESSION_MS = 1000 * 60 * 60 * 24 * 14;

loadAccountsState();

export function defaultAccountSettings(): AccountProfile["settings"] {
  return {
    compactFeed: false,
    showMetricsInline: true,
    highContrast: false,
    reduceMotion: false,
    communityFeedUnlocked: false,
  };
}

function hashPassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return { salt: salt.toString("hex"), hash: derived.toString("hex") };
}

function verifyPassword(password: string, saltHex: string, hashHex: string): boolean {
  try {
    const salt = Buffer.from(saltHex, "hex");
    const want = Buffer.from(hashHex, "hex");
    const got = scryptSync(password, salt, 64);
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

export function normalizeHandle(raw: string): string | null {
  const h = raw.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(h)) return null;
  return h;
}

export function defaultProfile(handle: string, displayName?: string): AccountProfile {
  const dn = (displayName?.trim() || handle).slice(0, 64);
  return {
    handle,
    displayName: dn,
    bio: "",
    about: "",
    profession: "",
    location: "",
    socialLinks: {},
    settings: defaultAccountSettings(),
    layout: {
      cols: 12,
      rowHeight: 42,
      items: [
        { i: "about", x: 0, y: 0, w: 4, h: 2, minW: 2, minH: 2 },
        { i: "links", x: 0, y: 2, w: 4, h: 2, minW: 2, minH: 2 },
        { i: "feed", x: 4, y: 0, w: 8, h: 5, minW: 4, minH: 3 },
        { i: "composer", x: 4, y: 5, w: 8, h: 3, minW: 4, minH: 2 },
      ],
    },
    linkedWallets: [],
  };
}

export function registerAccount(handleRaw: string, password: string, displayName?: string) {
  const handle = normalizeHandle(handleRaw);
  if (!handle) throw new Error("invalid_handle");
  if (password.length < 8) throw new Error("password_too_short");
  if (accounts.has(handle)) throw new Error("handle_taken");
  const { salt, hash } = hashPassword(password);
  const profile = defaultProfile(handle, displayName);
  accounts.set(handle, { handle, passwordSalt: salt, passwordHash: hash, profile });
  persistAccountsState();
  return profile;
}

export function login(handleRaw: string, password: string): string {
  const handle = normalizeHandle(handleRaw);
  if (!handle) throw new Error("invalid_handle");
  const acc = accounts.get(handle);
  if (!acc) throw new Error("invalid_credentials");
  if (!verifyPassword(password, acc.passwordSalt, acc.passwordHash)) throw new Error("invalid_credentials");
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { handle, exp: Date.now() + SESSION_MS });
  persistAccountsState();
  return token;
}

export function resolveSession(token: string | null): string | null {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.exp < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s.handle;
}

export function getStoredAccount(handle: string): StoredAccount | undefined {
  return accounts.get(handle.toLowerCase());
}

export function getPublicProfile(handle: string): AccountProfile | null {
  const acc = accounts.get(handle.toLowerCase());
  if (!acc) return null;
  const p = structuredClone(acc.profile);
  p.settings = { ...defaultAccountSettings(), ...p.settings };
  return p;
}

export function updateProfile(handle: string, patch: Partial<AccountProfile>): AccountProfile {
  const acc = accounts.get(handle.toLowerCase());
  if (!acc) throw new Error("not_found");
  const next: AccountProfile = {
    ...acc.profile,
    ...patch,
    handle: acc.profile.handle,
    settings: { ...defaultAccountSettings(), ...acc.profile.settings, ...patch.settings },
    socialLinks: { ...acc.profile.socialLinks, ...patch.socialLinks },
    layout: patch.layout
      ? {
          cols: patch.layout.cols ?? acc.profile.layout.cols,
          rowHeight: patch.layout.rowHeight ?? acc.profile.layout.rowHeight,
          items: patch.layout.items ?? acc.profile.layout.items,
        }
      : acc.profile.layout,
    linkedWallets: patch.linkedWallets ?? acc.profile.linkedWallets,
  };
  acc.profile = next;
  persistAccountsState();
  return structuredClone(next);
}

export function linkWalletMessage(handle: string, ts: number) {
  return `DirecT:link-wallet:${handle}:${ts}`;
}

export async function linkWalletForAccount(handle: string, address: Address, message: string, signature: Hex) {
  const ok = await verifyMessage({ address, message, signature });
  if (!ok) throw new Error("bad_signature");
  const acc = accounts.get(handle.toLowerCase());
  if (!acc) throw new Error("not_found");
  const msgHandle = message.match(/^DirecT:link-wallet:([a-z0-9_]+):(\d+)$/);
  if (!msgHandle || msgHandle[1] !== handle) throw new Error("bad_message");
  const set = new Set(acc.profile.linkedWallets.map((a) => a.toLowerCase()));
  set.add(address.toLowerCase());
  acc.profile.linkedWallets = [...set];
  persistAccountsState();
  return getPublicProfile(handle)!;
}

export function assertWalletLinkedToHandle(handle: string | undefined, signer: string): void {
  if (!handle) return;
  const h = normalizeHandle(handle);
  if (!h) throw new Error("invalid_handle_field");
  const acc = accounts.get(h);
  if (!acc) throw new Error("unknown_handle");
  if (!acc.profile.linkedWallets.includes(signer.toLowerCase())) {
    throw new Error("wallet_not_linked");
  }
}
