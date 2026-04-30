/**
 * Generate DEPLOYER_PRIVATE_KEY and write contracts/.env (never prints the key).
 * Run from repo: npm run gen:deployer --prefix contracts
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Wallet } = require("ethers");

const contractsRoot = path.join(__dirname, "..");
const envPath = path.join(contractsRoot, ".env");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Usage: node scripts/generate-deployer-env.cjs

Creates or updates contracts/.env with a new DEPLOYER_PRIVATE_KEY.
The private key is never printed — only the public address (fund on Base Sepolia).

If .env already exists, other lines are preserved; only DEPLOYER_PRIVATE_KEY is replaced.
`);
  process.exit(0);
}

const pk = `0x${crypto.randomBytes(32).toString("hex")}`;
const address = new Wallet(pk).address;

let body = "";
if (fs.existsSync(envPath)) {
  body = fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("DEPLOYER_PRIVATE_KEY="))
    .join("\n")
    .trim();
  if (body) body += "\n";
}
body += `DEPLOYER_PRIVATE_KEY=${pk}\n`;
fs.writeFileSync(envPath, body, "utf8");

console.log("Updated contracts/.env — private key is not shown. Back up .env securely.");
console.log("Fund this address on Base Sepolia:", address);
