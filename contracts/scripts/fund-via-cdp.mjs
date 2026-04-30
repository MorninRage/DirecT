/**
 * Request Base Sepolia ETH via Coinbase Developer Platform (programmatic faucet).
 * No browser. One-time: create API key + wallet secret at https://portal.cdp.coinbase.com
 *
 * Env (in contracts/.env):
 *   DEPLOYER_PRIVATE_KEY
 *   CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { CdpClient } from "@coinbase/cdp-sdk";
import { Wallet, JsonRpcProvider, formatEther } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const apiKeyId = process.env.CDP_API_KEY_ID;
const apiKeySecret = process.env.CDP_API_KEY_SECRET;
const walletSecret = process.env.CDP_WALLET_SECRET;

if (!apiKeyId || !apiKeySecret || !walletSecret) {
  console.error("Missing CDP credentials. Add to contracts/.env:");
  console.error("  CDP_API_KEY_ID=...");
  console.error("  CDP_API_KEY_SECRET=...");
  console.error("  CDP_WALLET_SECRET=...");
  console.error("\nCreate them (free): https://portal.cdp.coinbase.com/access/api");
  process.exit(1);
}

const pk = process.env.DEPLOYER_PRIVATE_KEY;
if (!pk) {
  console.error("Missing DEPLOYER_PRIVATE_KEY. Run: npm run gen:deployer");
  process.exit(1);
}

const address = new Wallet(pk).address;
const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

const cdp = new CdpClient({
  apiKeyId,
  apiKeySecret,
  walletSecret,
});

console.log("Requesting Base Sepolia ETH via CDP faucet for deployer:", address);

let faucetResp;
try {
  faucetResp = await cdp.evm.requestFaucet({
    address,
    network: "base-sepolia",
    token: "eth",
  });
} catch (e) {
  console.error("CDP faucet request failed:", e?.message ?? e);
  console.error("If rate-limited, wait or use another faucet once for this address.");
  process.exit(1);
}

console.log("Faucet tx hash:", faucetResp.transactionHash ?? faucetResp);

if (faucetResp.transactionHash) {
  const provider = new JsonRpcProvider(rpc);
  console.log("Waiting for confirmation…");
  try {
    await provider.waitForTransaction(faucetResp.transactionHash);
  } catch {
    console.warn("Receipt wait failed or timed out; run npm run check:gas.");
  }
  const bal = await provider.getBalance(address);
  console.log("Deployer balance now:", formatEther(bal), "ETH");
} else {
  console.log("No transaction hash in response; run npm run check:gas.");
}
