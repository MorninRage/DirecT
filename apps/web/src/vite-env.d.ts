/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAY_URL: string;
  readonly VITE_RPC_URL: string;
  readonly VITE_CHAIN_ID: string;
  /** DirecTToken contract (0x…42 chars). Optional until contracts are deployed. */
  readonly VITE_TOKEN_ADDRESS?: string;
  /** EmissionsController contract. Optional. */
  readonly VITE_EMISSIONS_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
