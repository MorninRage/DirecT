import { RELAY } from "../config";
import type { AccountProfile } from "../types/account";

export type PublishedRewardEpoch = {
  id: string;
  root: string;
  chainId: number;
  publishedAtMs: number;
  registerTxHash?: string;
  manifestUrl?: string;
  allocations: Array<{ beneficiary: string; amountWei: string }>;
};

export type RewardsMeResponse =
  | {
      eligible: true;
      epochId: string;
      root: string;
      beneficiary: string;
      amountWei: string;
      chainId: number;
      allocations: PublishedRewardEpoch["allocations"];
    }
  | { eligible: false; epoch: { id: string; root: string; chainId: number } | null };

export const ACCOUNT_TOKEN_KEY = "direct_account_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(ACCOUNT_TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(ACCOUNT_TOKEN_KEY, token);
  else localStorage.removeItem(ACCOUNT_TOKEN_KEY);
}

export async function apiRegister(handle: string, password: string, displayName?: string) {
  const r = await fetch(`${RELAY}/v1/accounts/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, password, displayName }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? (await r.text()));
  }
  return r.json() as Promise<{ token: string; profile: AccountProfile }>;
}

export async function apiLogin(handle: string, password: string) {
  const r = await fetch(`${RELAY}/v1/accounts/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, password }),
  });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { error?: string } | null;
    const code = j?.error;
    if (code === "invalid_handle") throw new Error("invalid_handle");
    if (code === "invalid_body") throw new Error("invalid_body");
    throw new Error(code ?? "invalid_credentials");
  }
  return r.json() as Promise<{ token: string; profile: AccountProfile }>;
}

export async function apiMe(token: string) {
  const r = await fetch(`${RELAY}/v1/accounts/me`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error("auth_failed");
  return r.json() as Promise<AccountProfile>;
}

export async function apiPublicProfile(handle: string) {
  const r = await fetch(`${RELAY}/v1/accounts/public/${encodeURIComponent(handle)}`);
  if (!r.ok) return null;
  return r.json() as Promise<AccountProfile>;
}

export async function apiPatchProfile(token: string, patch: Partial<AccountProfile>) {
  const r = await fetch(`${RELAY}/v1/accounts/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<AccountProfile>;
}

export async function apiLinkWalletChallenge(token: string) {
  const r = await fetch(`${RELAY}/v1/link-wallet/challenge`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ message: string; timestamp: number }>;
}

export async function apiMeNotifications(token: string) {
  const r = await fetch(`${RELAY}/v1/accounts/me/notifications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    items: Array<{
      id: string;
      kind: string;
      postEid: string;
      actor: string;
      summary: string;
      at: number;
      directHandle: string | null;
    }>;
  }>;
}

export async function apiLinkWallet(token: string, address: string, message: string, signature: string) {
  const r = await fetch(`${RELAY}/v1/accounts/me/link-wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ address, message, signature }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<AccountProfile>;
}

export async function apiLatestRewardEpoch(): Promise<PublishedRewardEpoch | null> {
  const r = await fetch(`${RELAY}/v1/rewards/epochs/latest`);
  if (!r.ok) throw new Error(await r.text());
  const j = (await r.json()) as { epoch: PublishedRewardEpoch | null };
  return j.epoch ?? null;
}

export async function apiRewardsMe(token: string): Promise<RewardsMeResponse> {
  const r = await fetch(`${RELAY}/v1/rewards/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<RewardsMeResponse>;
}

export async function apiFollow(token: string, handle: string) {
  const r = await fetch(`${RELAY}/v1/accounts/me/follow`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ handle }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<AccountProfile>;
}

export async function apiUnfollow(token: string, handle: string) {
  const r = await fetch(`${RELAY}/v1/accounts/me/follow/${encodeURIComponent(handle)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<AccountProfile>;
}

export async function apiFollowers(handle: string) {
  const r = await fetch(`${RELAY}/v1/accounts/${encodeURIComponent(handle)}/followers`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ handles: string[] }>;
}

export async function apiFollowingHandles(handle: string) {
  const r = await fetch(`${RELAY}/v1/accounts/${encodeURIComponent(handle)}/following`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ handles: string[] }>;
}
