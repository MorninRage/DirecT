import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const Token = await ethers.getContractFactory("DirecTToken");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  const Emissions = await ethers.getContractFactory("EmissionsController");
  const emissions = await Emissions.deploy(deployer.address, await token.getAddress());
  await emissions.waitForDeployment();
  await token.setMinter(await emissions.getAddress(), true);
  // eslint-disable-next-line no-console
  console.log("DirecTToken:", await token.getAddress());
  // eslint-disable-next-line no-console
  console.log("EmissionsController:", await emissions.getAddress());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
