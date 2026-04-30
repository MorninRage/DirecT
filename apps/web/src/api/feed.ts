import { RELAY } from "../config";

export function feedUrl(handle?: string) {
  const q = handle ? `?handle=${encodeURIComponent(handle)}` : "";
  return `${RELAY}/v1/feed${q}`;
}
