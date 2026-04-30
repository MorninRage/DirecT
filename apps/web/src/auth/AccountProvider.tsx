import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AccountProfile } from "../types/account";
import {
  ACCOUNT_TOKEN_KEY,
  apiLogin,
  apiMe,
  apiRegister,
  getStoredToken,
  setStoredToken,
} from "../api/relayAccounts";

type Ctx = {
  token: string | null;
  profile: AccountProfile | null;
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  login: (handle: string, password: string) => Promise<void>;
  register: (handle: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AccountCtx = createContext<Ctx | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStoredToken(token);
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const p = await apiMe(token);
      setProfile(p);
      setError(null);
    } catch {
      setProfile(null);
      setToken(null);
      localStorage.removeItem(ACCOUNT_TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (handle: string, password: string) => {
    setError(null);
    try {
      const { token: t, profile: p } = await apiLogin(handle, password);
      setToken(t);
      setProfile(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      throw e;
    }
  }, []);

  const register = useCallback(async (handle: string, password: string, displayName?: string) => {
    setError(null);
    try {
      const { token: t, profile: p } = await apiRegister(handle, password, displayName);
      setToken(t);
      setProfile(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Register failed");
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      profile,
      loading,
      error,
      setError,
      login,
      register,
      logout,
      refresh,
    }),
    [token, profile, loading, error, login, register, logout, refresh],
  );

  return <AccountCtx.Provider value={value}>{children}</AccountCtx.Provider>;
}

export function useAccountProfile(): Ctx {
  const c = useContext(AccountCtx);
  if (!c) throw new Error("useAccountProfile outside AccountProvider");
  return c;
}
