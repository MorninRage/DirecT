import { createContext, useContext } from "react";

/** Opens the Wallet & signing modal (AccessHub). No-op if used outside HudChrome. */
export const OpenWalletHubContext = createContext<() => void>(() => {});

export function useOpenWalletHub(): () => void {
  return useContext(OpenWalletHubContext);
}
