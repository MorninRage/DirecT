import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccountProfile } from "../auth/AccountProvider";
import { apiMeNotifications } from "../api/relayAccounts";

const SEEN_KEY = "direct_notif_seen_ids";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveSeen(s: Set<string>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-500)));
}

export function NotificationBell() {
  const { token, profile } = useAccountProfile();
  const [items, setItems] = useState<
    Array<{
      id: string;
      kind: string;
      postEid: string;
      actor: string;
      summary: string;
      at: number;
      directHandle: string | null;
    }>
  >([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(async () => {
    if (!token) return;
    try {
      const { items: next } = await apiMeNotifications(token);
      setItems(next);
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), 22_000);
    return () => window.clearInterval(id);
  }, [poll]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!token || !profile) return null;

  const unread = items.filter((i) => !seen.has(i.id)).length;

  const markAllSeen = () => {
    const next = new Set(seen);
    for (const i of items) next.add(i.id);
    setSeen(next);
    saveSeen(next);
  };

  const openPanel = () => {
    setOpen(true);
    markAllSeen();
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button type="button" className="hud-btn" onClick={() => (open ? setOpen(false) : openPanel())}>
        Alerts{unread ? ` (${unread})` : ""}
      </button>
      {open ? (
        <div
          className="hud-panel"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 8,
            width: 320,
            maxHeight: 360,
            overflowY: "auto",
            zIndex: 80,
            padding: 12,
          }}
        >
          <div className="hud-label" style={{ marginBottom: 8 }}>
            Activity on your posts
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--hud-dim)" }}>No comments, reactions, or reshares yet.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {items.map((n) => (
                <li
                  key={n.id}
                  style={{
                    fontSize: 12,
                    borderLeft: "2px solid rgba(126,203,255,0.35)",
                    paddingLeft: 8,
                  }}
                >
                  <div style={{ color: "var(--hud-dim)" }}>
                    {n.kind} · {new Date(n.at * 1000).toLocaleString()}
                  </div>
                  <div className="hud-mono" style={{ fontSize: 11, marginTop: 2 }}>
                    {n.actor.slice(0, 8)}…
                  </div>
                  <div style={{ marginTop: 4 }}>{n.summary}</div>
                  <div style={{ marginTop: 6 }}>
                    <Link className="hud-link" to="/">
                      Open feed
                    </Link>
                    {n.directHandle ? (
                      <>
                        {" · "}
                        <Link className="hud-link" to={`/u/${n.directHandle}`}>
                          @{n.directHandle}
                        </Link>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
