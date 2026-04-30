import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAccountProfile } from "../auth/AccountProvider";
import { HudChrome } from "./HudChrome";

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/direct/")) return true;
  return /^\/u\/[^/]+$/.test(pathname);
}

export function AppShell() {
  const { token, loading } = useAccountProfile();
  const loc = useLocation();
  const pub = isPublicPath(loc.pathname);

  if (pub) {
    return (
      <HudChrome>
        <Outlet />
      </HudChrome>
    );
  }

  if (loading) {
    return (
      <div className="hud-shell">
        <div className="hud-panel">Loading…</div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  }

  return (
    <HudChrome>
      <Outlet />
    </HudChrome>
  );
}
