/**
 * Read contracts/deployments/baseSepolia.json and set Netlify build env vars.
 * Run from repo root: npm run netlify:sync-token --prefix contracts
 * Requires: netlify CLI logged in, linked site, and a successful deploy:base first.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const contractsRoot = path.join(__dirname, "..");
const repoRoot = path.join(contractsRoot, "..");
const depPath = path.join(contractsRoot, "deployments", "baseSepolia.json");

if (!fs.existsSync(depPath)) {
  console.error("Missing", depPath);
  console.error("Run first: npm run deploy:base --prefix contracts (after funding deployer)");
  process.exit(1);
}

const { DirecTToken, EmissionsController } = JSON.parse(fs.readFileSync(depPath, "utf8"));
if (!DirecTToken || !EmissionsController) {
  console.error("Invalid deployment file:", depPath);
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { cwd: repoRoot, stdio: "inherit", env: process.env });
}

run(`netlify env:set VITE_TOKEN_ADDRESS "${DirecTToken}" --context production --scope builds --force`);
run(`netlify env:set VITE_EMISSIONS_ADDRESS "${EmissionsController}" --context production --scope builds --force`);
console.log("\nNetlify production build variables updated. Trigger a new site deploy to bake them into the bundle.");
