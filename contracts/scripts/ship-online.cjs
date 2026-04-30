/**
 * One-shot: optional CDP faucet → gas check → Base Sepolia deploy → Netlify env sync → prod deploy.
 * Run from contracts/: npm run ship:online
 *
 * For agent-friendly funding (no browser): set CDP_API_KEY_ID, CDP_API_KEY_SECRET,
 * CDP_WALLET_SECRET in contracts/.env (see .env.example + Coinbase CDP portal).
 */
const { execSync } = require("child_process");
const path = require("path");
const { setTimeout: sleep } = require("timers/promises");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const contractsRoot = path.join(__dirname, "..");
const repoRoot = path.join(contractsRoot, "..");

function sh(cmd, cwd) {
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
}

async function main() {
  const hasCdp =
    process.env.CDP_API_KEY_ID &&
    process.env.CDP_API_KEY_SECRET &&
    process.env.CDP_WALLET_SECRET;

  if (hasCdp) {
    console.log("0/5 Fund deployer via Coinbase CDP (programmatic faucet)…");
    sh("node scripts/fund-via-cdp.mjs", contractsRoot);
    console.log("Waiting 15s for balance to settle…");
    await sleep(15_000);
  } else {
    console.log(
      "No CDP_* in contracts/.env — skipping automated faucet.\n" +
        "Add CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET (https://portal.cdp.coinbase.com/access/api)\n" +
        "or fund the deployer manually, then re-run.\n",
    );
  }

  console.log("1/5 Check deployer gas on Base Sepolia…");
  sh("node scripts/check-deployer-gas.cjs", contractsRoot);

  console.log("\n2/5 Deploy DirecTToken + EmissionsController…");
  sh("npm run deploy:base", contractsRoot);

  console.log("\n3/5 Sync VITE_TOKEN_ADDRESS / VITE_EMISSIONS_ADDRESS to Netlify…");
  sh("node scripts/sync-netlify-token-env.cjs", contractsRoot);

  console.log("\n4/5 Netlify production deploy (build + publish)…");
  sh("npx netlify deploy --prod --build", repoRoot);

  console.log("\nShip complete: on-chain addresses are live and the site should embed them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
