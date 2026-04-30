/**
 * Print deployer address + Base Sepolia ETH balance; exit if too low for deploy.
 * Never prints the private key. Uses BASE_SEPOLIA_RPC_URL or https://sepolia.base.org
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Wallet, JsonRpcProvider, formatEther, parseEther } = require("ethers");

// Enough for token + emissions deploy on Base Sepolia (faucets often drip ~0.0001 ETH)
const MIN_WEI = parseEther("0.000015");

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("Missing DEPLOYER_PRIVATE_KEY. Run: npm run gen:deployer");
    process.exit(1);
  }
  const rpc = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
  const wallet = new Wallet(pk);
  const provider = new JsonRpcProvider(rpc);
  const bal = await provider.getBalance(wallet.address);
  console.log("Deployer (fund this address on Base Sepolia with testnet ETH for gas):");
  console.log(" ", wallet.address);
  console.log("Base Sepolia ETH balance:", formatEther(bal));
  if (bal < MIN_WEI) {
    console.error("\nNot enough ETH for gas. Use a faucet (wallet or paste address) — not DIR:");
    console.error("  https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
    console.error("  https://faucet.quicknode.com/base/sepolia");
    console.error("  https://faucets.chain.link/base-sepolia");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
