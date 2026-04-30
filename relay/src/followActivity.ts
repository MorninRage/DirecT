/** In-memory ring buffer of follow actions for notifications (MVP). */
const MAX = 10_000;

type FollowRow = { follower: string; target: string; atMs: number };

const followLog: FollowRow[] = [];

export function recordFollow(followerHandle: string, targetHandle: string): void {
  followLog.push({
    follower: followerHandle.toLowerCase(),
    target: targetHandle.toLowerCase(),
    atMs: Date.now(),
  });
  while (followLog.length > MAX) followLog.shift();
}

/** Most recent follows of `targetHandle` by others (newest first). */
export function listRecentFollowsForTarget(targetHandle: string, limit: number): FollowRow[] {
  const t = targetHandle.toLowerCase();
  const out = followLog.filter((r) => r.target === t).reverse();
  return out.slice(0, limit);
}
