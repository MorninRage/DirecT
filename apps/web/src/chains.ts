import { defineChain } from "viem";

const id = Number(import.meta.env.VITE_CHAIN_ID ?? 84532);
const rpc = import.meta.env.VITE_RPC_URL ?? "";

export const appChain = defineChain({
  id,
  name: "DirecT dev",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: [rpc || "https://sepolia.base.org"] } },
});
