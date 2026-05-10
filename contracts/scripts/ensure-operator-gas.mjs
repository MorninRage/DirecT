/**
 * Operator: keep Base Sepolia ETH on the keys you use for ops + gasless claims.
 * Uses the same CDP faucet flow as before — now supports an optional relayer key.
 *
 * Env (contracts/.env):
 *   DEPLOYER_PRIVATE_KEY     — funded for deploy / registerRoot (required)
 *   RELAYER_PRIVATE_KEY      — optional; same key as deployer OK on testnet; if different, it is funded too
 *   CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
 *   OPERATOR_MIN_ETH  (optional, default "0.0005")
 *   BASE_SEPOLIA_RPC_URL  (optional)
 *
 * Usage: npm run ensure:gas
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
const deployerPk = process.env.DEPLOYER_PRIVATE_KEY;
const relayerPk = process.env.RELAYER_PRIVATE_KEY?.trim();
const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";

const MIN_ETH = process.env.OPERATOR_MIN_ETH ?? "0.0005";

async function ensureFunded(cdp, provider, privateKey, label) {
  let minWei;
  try {
    minWei = parseEther(MIN_ETH);
  } catch {
    console.error("Invalid OPERATOR_MIN_ETH:", MIN_ETH);
    process.exit(1);
  }

  const wallet = new Wallet(privateKey);
  const bal = await provider.getBalance(wallet.address);

  console.log(`\n${label} address:`, wallet.address);
  console.log("Base Sepolia ETH:", formatEther(bal));
  console.log("Target minimum:", MIN_ETH, "ETH");

  if (bal >= minWei) {
    console.log("Balance OK — skipping CDP faucet for this key.");
    return;
  }

  console.log(`Below minimum — requesting Base Sepolia ETH via CDP for ${label}…`);

  let faucetResp;
  try {
    faucetResp = await cdp.evm.requestFaucet({
      address: wallet.address,
      network: "base-sepolia",
      token: "eth",
    });
  } catch (e) {
    console.error("CDP faucet failed:", e?.message ?? e);
    console.error("If rate-limited: wait or send testnet ETH manually to", wallet.address);
    process.exit(1);
  }

  console.log("Faucet response:", faucetResp.transactionHash ?? faucetResp);

  if (faucetResp.transactionHash) {
    console.log("Waiting for confirmation…");
    try {
      await provider.waitForTransaction(faucetResp.transactionHash);
    } catch {
      console.warn("Receipt wait timed out; check explorer.");
    }
    const next = await provider.getBalance(wallet.address);
    console.log("Balance now:", formatEther(next), "ETH");
    if (next < minWei) {
      console.warn("Still below target — CDP drip may be small; retry later or use a second faucet.");
    }
  }
}

async function main() {
  if (!deployerPk) {
    console.error("Missing DEPLOYER_PRIVATE_KEY.");
    process.exit(1);
  }
  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    console.error("Missing CDP_* credentials — cannot auto-fund. Options:");
    console.error("  1) Add CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET to contracts/.env");
    console.error("  2) Or manually send Base Sepolia ETH to deployer + relayer addresses");
    process.exit(1);
  }

  const provider = new JsonRpcProvider(rpc);
  const cdp = new CdpClient({
    apiKeyId,
    apiKeySecret,
    walletSecret,
  });

  await ensureFunded(cdp, provider, deployerPk, "Deployer");

  if (relayerPk) {
    const d = new Wallet(deployerPk).address.toLowerCase();
    const r = new Wallet(relayerPk).address.toLowerCase();
    if (r === d) {
      console.log("\nRelayer address matches deployer — same ETH pays for deploy + gasless claims.");
    } else {
      await ensureFunded(cdp, provider, relayerPk, "Relayer (gasless claims)");
    }
  } else {
    console.log(
      "\nOptional: set RELAYER_PRIVATE_KEY in contracts/.env (same as deployer is OK on testnet) and re-run to fund via CDP.\nFly still needs: fly secrets set RELAYER_PRIVATE_KEY=...",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
