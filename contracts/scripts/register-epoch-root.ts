import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import hre from "hardhat";

type EpochFile = {
  epochId: string;
  chainId: number;
  root: string;
  allocations?: unknown[];
};

function pickEpochPath(): string | null {
  if (process.env.EPOCH_FILE) return process.env.EPOCH_FILE;
  const jsonArgs = process.argv.filter((a) => a.endsWith(".json"));
  if (jsonArgs.length) return jsonArgs[jsonArgs.length - 1];
  return null;
}

async function main() {
  const epochPath = pickEpochPath();
  if (!epochPath) {
    throw new Error("Pass epoch .json path as an argument (e.g. epochs/epoch-id.json) or set EPOCH_FILE=");
  }
  const full = path.isAbsolute(epochPath) ? epochPath : path.join(process.cwd(), epochPath);
  const raw = fs.readFileSync(full, "utf8");
  const epoch = JSON.parse(raw) as EpochFile;
  if (!epoch.root?.startsWith("0x")) throw new Error("epoch.root missing");
  if (!Array.isArray(epoch.allocations) || epoch.allocations.length === 0) {
    throw new Error("empty allocations — refusing registerRoot(0) or pointless epoch");
  }

  const net = hre.network.name;
  const deployPath = path.join(__dirname, "..", "deployments", `${net}.json`);
  let emissionsAddr: string;
  if (process.env.EMISSIONS_ADDRESS) {
    emissionsAddr = process.env.EMISSIONS_ADDRESS;
  } else if (fs.existsSync(deployPath)) {
    const dep = JSON.parse(fs.readFileSync(deployPath, "utf8")) as { EmissionsController?: string };
    if (!dep.EmissionsController) throw new Error(`No EmissionsController in ${deployPath}`);
    emissionsAddr = dep.EmissionsController;
  } else {
    throw new Error(`Missing deployments/${net}.json — set EMISSIONS_ADDRESS or deploy first`);
  }

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer (DEPLOYER_PRIVATE_KEY / .env)");

  const emissions = await hre.ethers.getContractAt("EmissionsController", emissionsAddr, signer);
  const root = epoch.root as `0x${string}`;
  const tx = await emissions.registerRoot(root);
  const receipt = await tx.wait();
  const hash = receipt?.hash ?? tx.hash;

  const next = { ...JSON.parse(raw) as Record<string, unknown>, registerTxHash: hash };
  fs.writeFileSync(full, JSON.stringify(next, null, 2) + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log("registerRoot ok", hash, "emissions", emissionsAddr, "epoch", epoch.epochId);

  const { chainId } = await hre.ethers.provider.getNetwork();
  if (Number(chainId) !== epoch.chainId) {
    // eslint-disable-next-line no-console
    console.warn(`Warning: epoch.chainId=${epoch.chainId} but network chainId=${chainId}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
