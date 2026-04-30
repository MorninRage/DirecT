import type { Address } from "viem";

export const RELAY = import.meta.env.VITE_RELAY_URL ?? "http://127.0.0.1:8787";

function parseAddr(v: string | undefined): Address | undefined {
  if (v == null || typeof v !== "string") return undefined;
  const t = v.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(t)) return undefined;
  return t as Address;
}

/** Set `VITE_TOKEN_ADDRESS` after deploying DirecTToken (e.g. Netlify env). */
export const TOKEN_ADDRESS = parseAddr(import.meta.env.VITE_TOKEN_ADDRESS);

/** Set `VITE_EMISSIONS_ADDRESS` for future claim UI / tooling. */
export const EMISSIONS_ADDRESS = parseAddr(import.meta.env.VITE_EMISSIONS_ADDRESS);
