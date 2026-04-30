import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAccountProfile } from "../auth/AccountProvider";

export function AuthPage() {
  const navigate = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  const { login, register, error, loading, token } = useAccountProfile();

  const [regHandle, setRegHandle] = useState("");
  const [regPw, setRegPw] = useState("");
  const [regName, setRegName] = useState("");
  const [logHandle, setLogHandle] = useState("");
  const [logPw, setLogPw] = useState("");

  const destination = from && from !== "/auth" ? from : "/";

  useEffect(() => {
    if (token) navigate(destination, { replace: true });
  }, [token, destination, navigate]);

  const onRegister = async () => {
    try {
      await register(regHandle, regPw, regName || undefined);
      navigate(destination, { replace: true });
    } catch {
      /* error in provider */
    }
  };

  const onLogin = async () => {
    try {
      await login(logHandle, logPw);
      navigate(destination, { replace: true });
    } catch {
      /* error in provider */
    }
  };

  if (token) return null;

  return (
    <div className="hud-shell" style={{ maxWidth: 480, margin: "0 auto", paddingTop: 48 }}>
      <div className="hud-brand" style={{ marginBottom: 20 }}>
        DirecT
      </div>
      <section className="hud-panel">
        <div className="hud-label">Sign in or create your profile</div>
        <p style={{ color: "var(--hud-dim)", marginTop: 0, lineHeight: 1.55, fontSize: 14 }}>
          Your <strong>profile</strong> is your @handle, password, and homepage. After this step you’ll connect a separate{" "}
          <strong>signing wallet</strong> from the app to publish and earn.
        </p>

        <div className="hud-label" style={{ marginTop: 18 }}>
          Create profile
        </div>
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <input
            className="hud-input"
            placeholder="handle (3–32: a–z 0–9 _)"
            value={regHandle}
            onChange={(e) => setRegHandle(e.target.value)}
            autoComplete="username"
          />
          <input
            className="hud-input"
            type="password"
            placeholder="password (min 8)"
            value={regPw}
            onChange={(e) => setRegPw(e.target.value)}
            autoComplete="new-password"
          />
          <input
            className="hud-input"
            placeholder="display name (optional)"
            value={regName}
            onChange={(e) => setRegName(e.target.value)}
          />
          <button type="button" className="hud-btn hud-btn--primary" disabled={loading} onClick={() => void onRegister()}>
            Sign up
          </button>
        </div>

        <div className="hud-label">Log in</div>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            className="hud-input"
            placeholder="handle"
            value={logHandle}
            onChange={(e) => setLogHandle(e.target.value)}
            autoComplete="username"
          />
          <input
            className="hud-input"
            type="password"
            placeholder="password"
            value={logPw}
            onChange={(e) => setLogPw(e.target.value)}
            autoComplete="current-password"
          />
          <button type="button" className="hud-btn" disabled={loading} onClick={() => void onLogin()}>
            Sign in
          </button>
        </div>

        {loading ? (
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--hud-dim)" }}>Working…</div>
        ) : null}
        {error ? <div className="hud-alert" style={{ marginTop: 14 }}>{error}</div> : null}

        <p style={{ marginTop: 20, fontSize: 12, color: "var(--hud-dim)" }}>
          Public wallet share pages stay open without a profile:{" "}
          <Link className="hud-link" to="/direct/0x0000000000000000000000000000000000000000">
            example wallet link
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
