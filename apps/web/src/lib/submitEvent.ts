import type { SignedPayload } from "../auth/DirectAuthProvider";
import { RELAY } from "../config";

export async function submitEvent(payload: SignedPayload): Promise<{ eid: string }> {
  const res = await fetch(`${RELAY}/v1/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json() as Promise<{ eid: string }>;
}

export async function uploadMedia(file: File): Promise<{ cid: string; mime: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${RELAY}/v1/media`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ cid: string; mime: string }>;
}
