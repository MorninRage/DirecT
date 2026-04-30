// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {DirecTToken} from "./DirecTToken.sol";

/// @notice MVP emissions: owner publishes Merkle roots; creators claim DIR. Replace with full indexer oracle later.
contract EmissionsController is Ownable {
    DirecTToken public immutable token;

    mapping(bytes32 root => bool active) public roots;
    mapping(bytes32 root => mapping(bytes32 leaf => bool claimed)) public claimed;

    event RootRegistered(bytes32 indexed root, address indexed registeredBy);
    event Claimed(bytes32 indexed root, address indexed beneficiary, uint256 amount);

    error RootInactive();
    error AlreadyClaimed();
    error InvalidProof();

    constructor(address initialOwner, DirecTToken token_) Ownable(initialOwner) {
        token = token_;
    }

    function registerRoot(bytes32 root) external onlyOwner {
        roots[root] = true;
        emit RootRegistered(root, msg.sender);
    }

    function claim(bytes32 root, address beneficiary, uint256 amount, bytes32[] calldata proof) external {
        if (!roots[root]) revert RootInactive();
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(beneficiary, amount))));
        if (!MerkleProof.verifyCalldata(proof, root, leaf)) revert InvalidProof();
        if (claimed[root][leaf]) revert AlreadyClaimed();
        claimed[root][leaf] = true;
        token.mint(beneficiary, amount);
        emit Claimed(root, beneficiary, amount);
    }

    /// @dev Fast path for testnet: owner pays an address directly (requires token minter role on controller).
    function payout(address beneficiary, uint256 amount) external onlyOwner {
        token.mint(beneficiary, amount);
        emit Claimed(bytes32(0), beneficiary, amount);
    }
}
