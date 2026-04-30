import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { useAccount, useChainId, useDisconnect, useWalletClient } from "wagmi";
import { appChain } from "../chains";
import { eip712Domain, eip712Types, eventMessage, type EventHeader } from "../eip712";

const STORAGE_KEY = "DIRECT_LOCAL_PK";

function normalizePrivateKeyHex(raw: string): Hex {
  const t = raw.trim();
  const with0x = t.startsWith("0x") || t.startsWith("0X") ? t.toLowerCase() : `0x${t.toLowerCase()}`;
  if (!/^0x[0-9a-f]{64}$/.test(with0x)) {
    throw new Error("Invalid key: need 64 hex characters (optionally with 0x).");
  }
  return with0x as Hex;
}

export type SignedPayload = {
  event: { header: EventHeader; body: Record<string, unknown> };
  signature: Hex;
};

export type Mode = "none" | "wallet" | "local";

export type DirectAuthState = {
  mode: Mode;
  address: Address | undefined;
  domainChainId: number;
  ready: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  signEnvelope: (header: EventHeader, body: Record<string, unknown>) => Promise<SignedPayload>;
  /** Sign a plain UTF-8 string (e.g. link-wallet challenge). Works for extension + embedded local key. */
  signUtf8Message: (message: string) => Promise<Hex>;
  createLocalWallet: () => Promise<Hex>;
  /** Restore session from a saved 32-byte hex private key (with or without 0x). */
  importLocalWallet: (rawPrivateKey: string) => Promise<void>;
  clearLocalWallet: () => void;
};

const DirectAuthContext = createContext<DirectAuthState | null>(null);

export function DirectAuthProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected, status } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const { disconnectAsync } = useDisconnect();
  const [localPk, setLocalPk] = useState<Hex | null>(() => {
    const s = sessionStorage.getItem(STORAGE_KEY);
    return s && s.startsWith("0x") && s.length === 66 ? (s as Hex) : null;
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localPk) sessionStorage.setItem(STORAGE_KEY, localPk);
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [localPk]);

  const localAccount = useMemo(
    () => (localPk ? privateKeyToAccount(localPk) : null),
    [localPk],
  );

  const mode: Mode = localAccount ? "local" : isConnected ? "wallet" : "none";
  const address: Address | undefined = localAccount?.address ?? wagmiAddress;

  /** For EIP-712: extension wallets must match their connected chain; local uses app chain. */
  const domainChainId = mode === "wallet" ? chainId : appChain.id;

  const signEnvelope = useCallback(
    async (header: EventHeader, body: Record<string, unknown>): Promise<SignedPayload> => {
      const domain = eip712Domain(domainChainId);
      const message = eventMessage(header, body);
      if (localAccount) {
        const signature = await localAccount.signTypedData({
          domain,
          types: eip712Types,
          primaryType: "DirecTEvent",
          message,
        });
        return { event: { header, body }, signature };
      }
      if (walletClient && wagmiAddress) {
        const signature = await walletClient.signTypedData({
          account: wagmiAddress,
          domain,
          types: eip712Types,
          primaryType: "DirecTEvent",
          message,
        });
        return { event: { header, body }, signature };
      }
      throw new Error("Not signed in");
    },
    [domainChainId, localAccount, walletClient, wagmiAddress],
  );

  const signUtf8Message = useCallback(
    async (message: string): Promise<Hex> => {
      if (localAccount) {
        return localAccount.signMessage({ message });
      }
      if (walletClient && wagmiAddress) {
        return walletClient.signMessage({ account: wagmiAddress, message });
      }
      throw new Error("No signing wallet — open Wallet in the top bar and connect or create a key.");
    },
    [localAccount, walletClient, wagmiAddress],
  );

  const createLocalWallet = useCallback(async (): Promise<Hex> => {
    try {
      await disconnectAsync();
    } catch {
      /* ignore */
    }
    const pk = generatePrivateKey();
    setLocalPk(pk);
    setError(null);
    return pk;
  }, [disconnectAsync]);

  const importLocalWallet = useCallback(async (rawPrivateKey: string) => {
    const pk = normalizePrivateKeyHex(rawPrivateKey);
    try {
      await disconnectAsync();
    } catch {
      /* ignore */
    }
    setLocalPk(pk);
    setError(null);
  }, [disconnectAsync]);

  const clearLocalWallet = useCallback(() => {
    setLocalPk(null);
  }, []);

  const ready = status !== "connecting";

  const value = useMemo(
    () =>
      ({
        mode,
        address,
        domainChainId,
        ready,
        error,
        setError,
        signEnvelope,
        signUtf8Message,
        createLocalWallet,
        importLocalWallet,
        clearLocalWallet,
      }) satisfies DirectAuthState,
    [mode, address, domainChainId, ready, error, signEnvelope, signUtf8Message, createLocalWallet, importLocalWallet, clearLocalWallet],
  );

  return <DirectAuthContext.Provider value={value}>{children}</DirectAuthContext.Provider>;
}

export function useDirectAuth(): DirectAuthState {
  const c = useContext(DirectAuthContext);
  if (!c) throw new Error("useDirectAuth outside DirectAuthProvider");
  return c;
}
