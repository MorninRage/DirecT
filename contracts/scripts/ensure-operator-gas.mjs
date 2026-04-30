/**
 * Director / operator: keep DEPLOYER_PRIVATE_KEY funded on Base Sepolia via CDP faucet.
 * Only calls the faucet if balance is below OPERATOR_MIN_ETH (default 0.0005 ETH).
 *
 * Env (contracts/.env):
 *   DEPLOYER_PRIVATE_KEY
 *   CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
 *   OPERATOR_MIN_ETH  (optional, default "0.0005")
 *   BASE_SEPOLIA_RPC_URL  (optional)
 *
 * Usage: npm run ensure:gas
 * Cron (daily): run from CI or your machine with .env present.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { CdpClient } from "@coinbase/cdp-sdk";
import { Wallet, JsonRpcProvider, formatEther, parseEther } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const apiKeyId = process.env.CDP_API_KEY_ID;
const apiKeySecret = process.env.CDP_API_KEY_SECRET;
const walletSecret = process.env.CDP_WALLET_SECRET;
const pk = process.env.DEPLOYER_PRIVATE_KEY;
const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

const MIN_ETH = process.env.OPERATOR_MIN_ETH ?? "0.0005";

async function main() {
  if (!pk) {
    console.error("Missing DEPLOYER_PRIVATE_KEY.");
    process.exit(1);
  }
  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    console.error("Missing CDP_* credentials — cannot auto-fund. Options:");
    console.error("  1) Add CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET to contracts/.env");
    console.error("  2) Or manually send Base Sepolia ETH to your deployer (see npm run check:gas)");
    process.exit(1);
  }

  let minWei;
  try {
    minWei = parseEther(MIN_ETH);
  } catch {
    console.error("Invalid OPERATOR_MIN_ETH:", MIN_ETH);
    process.exit(1);
  }

  const wallet = new Wallet(pk);
  const provider = new JsonRpcProvider(rpc);
  const bal = await provider.getBalance(wallet.address);

  console.log("Operator (deployer) address:", wallet.address);
  console.log("Base Sepolia ETH:", formatEther(bal));
  console.log("Target minimum:", MIN_ETH, "ETH (set OPERATOR_MIN_ETH to change)");

  if (bal >= minWei) {
    console.log("Balance OK — skipping CDP faucet.");
    return;
  }

  console.log("Below minimum — requesting Base Sepolia ETH via CDP…");

  const cdp = new CdpClient({
    apiKeyId,
    apiKeySecret,
    walletSecret,
  });

  let faucetResp;
  try {
    faucetResp = await cdp.evm.requestFaucet({
      address: wallet.address,
      network: "base-sepolia",
      token: "eth",
    });
  } catch (e) {
    console.error("CDP faucet failed:", e?.message ?? e);
    console.error("If rate-limited: wait or use a browser faucet once for", wallet.address);
    process.exit(1);
  }

  console.log("Faucet response:", faucetResp.transactionHash ?? faucetResp);

  if (faucetResp.transactionHash) {
    console.log("Waiting for confirmation…");
    try {
      await provider.waitForTransaction(faucetResp.transactionHash);
    } catch {
      console.warn("Receipt wait timed out; check explorer / run npm run check:gas");
    }
    const next = await provider.getBalance(wallet.address);
    console.log("Balance now:", formatEther(next), "ETH");
    if (next < minWei) {
      console.warn("Still below target — CDP drip may be small; retry later or use a second faucet.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
