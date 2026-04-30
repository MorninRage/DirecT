import { RELAY } from "../config";

export function feedUrl(handle?: string, opts?: { scope?: "following" }) {
  const p = new URLSearchParams();
  if (handle) p.set("handle", handle);
  if (opts?.scope === "following") p.set("scope", "following");
  const q = p.toString();
  return `${RELAY}/v1/feed${q ? `?${q}` : ""}`;
}

export async function fetchFeed(opts: { token?: string | null; handle?: string; scope?: "following" } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token && opts.scope === "following") headers.Authorization = `Bearer ${opts.token}`;
  return fetch(feedUrl(opts.handle, { scope: opts.scope }), { headers });
}
