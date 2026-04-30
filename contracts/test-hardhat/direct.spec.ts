import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("DirecTToken", function () {
  it("mints and burns", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DirecTToken");
    const token = await Token.deploy(deployer.address);
    await token.waitForDeployment();
    await token.mint(alice.address, ethers.parseEther("1"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
    await token.connect(alice).burn(ethers.parseEther("0.25"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("0.75"));
  });
});

describe("EmissionsController", function () {
  it("claims from merkle root", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DirecTToken");
    const token = await Token.deploy(deployer.address);
    await token.waitForDeployment();
    const Emissions = await ethers.getContractFactory("EmissionsController");
    const emissions = await Emissions.deploy(deployer.address, await token.getAddress());
    await emissions.waitForDeployment();
    await token.setMinter(await emissions.getAddress(), true);
    const amount = ethers.parseEther("100");
    const tree = StandardMerkleTree.of([[alice.address, amount]], ["address", "uint256"]);
    const root = tree.root;
    await emissions.registerRoot(root);
    const proof = tree.getProof([alice.address, amount]);
    await emissions.claim(root, alice.address, amount, proof);
    expect(await token.balanceOf(alice.address)).to.equal(amount);
  });

  it("owner payout shortcut", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DirecTToken");
    const token = await Token.deploy(deployer.address);
    await token.waitForDeployment();
    const Emissions = await ethers.getContractFactory("EmissionsController");
    const emissions = await Emissions.deploy(deployer.address, await token.getAddress());
    await emissions.waitForDeployment();
    await token.setMinter(await emissions.getAddress(), true);
    await emissions.payout(alice.address, ethers.parseEther("50"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("50"));
  });
});
