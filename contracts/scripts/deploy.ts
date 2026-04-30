import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";
import hre from "hardhat";

/** 1_000_000_000 DIR — matches DirecTToken.MAX_SUPPLY */
const GENESIS_SUPPLY = ethers.parseEther("1000000000");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account: set DEPLOYER_PRIVATE_KEY in the environment or in contracts/.env (see .env.example), then fund that address with Base Sepolia ETH.",
    );
  }
  const Token = await ethers.getContractFactory("DirecTToken");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();

  await (await token.mint(deployer.address, GENESIS_SUPPLY)).wait();
  // eslint-disable-next-line no-console
  console.log("Minted genesis:", ethers.formatEther(GENESIS_SUPPLY), "DIR to", deployer.address);

  const Emissions = await ethers.getContractFactory("EmissionsController");
  const emissions = await Emissions.deploy(deployer.address, tokenAddr);
  await emissions.waitForDeployment();
  const emAddr = await emissions.getAddress();

  // Seed emissions contract for Merkle claims / payouts (tune allocation off-chain).
  const emissionsSeed = ethers.parseEther("10000000"); // 10M DIR MVP pool
  await (await token.transfer(emAddr, emissionsSeed)).wait();
  // eslint-disable-next-line no-console
  console.log("Funded EmissionsController with", ethers.formatEther(emissionsSeed), "DIR");

  // eslint-disable-next-line no-console
  console.log("DirecTToken:", tokenAddr);
  // eslint-disable-next-line no-console
  console.log("EmissionsController:", emAddr);
  // eslint-disable-next-line no-console
  console.log("Set frontend: VITE_TOKEN_ADDRESS=" + tokenAddr);
  // eslint-disable-next-line no-console
  console.log("Set frontend: VITE_EMISSIONS_ADDRESS=" + emAddr);

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const net = hre.network.name;
  const outFile = path.join(deploymentsDir, `${net}.json`);
  const { chainId } = await ethers.provider.getNetwork();
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: net,
        chainId: Number(chainId),
        DirecTToken: tokenAddr,
        EmissionsController: emAddr,
      },
      null,
      2,
    ) + "\n",
  );
  // eslint-disable-next-line no-console
  console.log("Wrote deployment record:", outFile, "(safe to gitignore — used for netlify sync)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
