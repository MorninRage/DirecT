import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("DirecTToken", function () {
  it("mints and burns under cap", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DirecTToken");
    const token = await Token.deploy(deployer.address);
    await token.waitForDeployment();
    await token.mint(alice.address, ethers.parseEther("1"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("1"));
    await token.connect(alice).burn(ethers.parseEther("0.25"));
    expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("0.75"));
  });

  it("enforces 1B max supply", async function () {
    const [deployer] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DirecTToken");
    const token = await Token.deploy(deployer.address);
    await token.waitForDeployment();
    const cap = await token.MAX_SUPPLY();
    await token.mint(deployer.address, cap);
    expect(await token.totalSupply()).to.equal(cap);
    await expect(token.mint(deployer.address, 1n)).to.be.revertedWithCustomError(token, "SupplyCapExceeded");
  });
});

describe("EmissionsController", function () {
  it("claims from merkle root using contract balance", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DirecTToken");
    const token = await Token.deploy(deployer.address);
    await token.waitForDeployment();
    const Emissions = await ethers.getContractFactory("EmissionsController");
    const emissions = await Emissions.deploy(deployer.address, await token.getAddress());
    await emissions.waitForDeployment();
    const emAddr = await emissions.getAddress();

    const amount = ethers.parseEther("100");
    await token.mint(deployer.address, amount);
    await token.transfer(emAddr, amount);

    const tree = StandardMerkleTree.of([[alice.address, amount]], ["address", "uint256"]);
    const root = tree.root;
    await emissions.registerRoot(root);
    const proof = tree.getProof([alice.address, amount]);
    await emissions.claim(root, alice.address, amount, proof);
    expect(await token.balanceOf(alice.address)).to.equal(amount);
  });

  it("owner payout shortcut transfers balance", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DirecTToken");
    const token = await Token.deploy(deployer.address);
    await token.waitForDeployment();
    const Emissions = await ethers.getContractFactory("EmissionsController");
    const emissions = await Emissions.deploy(deployer.address, await token.getAddress());
    await emissions.waitForDeployment();
    const emAddr = await emissions.getAddress();

    const amount = ethers.parseEther("50");
    await token.mint(deployer.address, amount);
    await token.transfer(emAddr, amount);
    await emissions.payout(alice.address, amount);
    expect(await token.balanceOf(alice.address)).to.equal(amount);
  });

  it("claim reverts if underfunded", async function () {
    const [deployer, alice] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("DirecTToken");
    const token = await Token.deploy(deployer.address);
    await token.waitForDeployment();
    const Emissions = await ethers.getContractFactory("EmissionsController");
    const emissions = await Emissions.deploy(deployer.address, await token.getAddress());
    await emissions.waitForDeployment();

    const amount = ethers.parseEther("100");
    const tree = StandardMerkleTree.of([[alice.address, amount]], ["address", "uint256"]);
    const root = tree.root;
    await emissions.registerRoot(root);
    const proof = tree.getProof([alice.address, amount]);
    await expect(emissions.claim(root, alice.address, amount, proof)).to.be.revertedWithCustomError(
      emissions,
      "InsufficientBalance",
    );
  });
});
