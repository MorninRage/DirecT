import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { coinbaseWallet, injected, metaMask } from "wagmi/connectors";
import { appChain } from "./chains";
import { DirectAuthProvider } from "./auth/DirectAuthProvider";
import { AccountProvider } from "./auth/AccountProvider";
import App from "./App";
import "./styles/hud.css";

const rpc = import.meta.env.VITE_RPC_URL ?? "";

const queryClient = new QueryClient();

const config = createConfig({
  chains: [appChain],
  connectors: [
    metaMask(),
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: "DirecT" }),
  ],
  transports: { [appChain.id]: http(rpc || undefined) },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <DirectAuthProvider>
            <AccountProvider>
              <App />
            </AccountProvider>
          </DirectAuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
