// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {DirecTToken} from "./DirecTToken.sol";

/// @notice MVP emissions: Merkle claims and owner payouts transfer DIR from this contract's balance.
/// @dev Fund the contract by transferring DIR here (e.g. from treasury after genesis mint). No minting.
contract EmissionsController is Ownable {
    using SafeERC20 for IERC20;

    DirecTToken public immutable token;

    mapping(bytes32 root => bool active) public roots;
    mapping(bytes32 root => mapping(bytes32 leaf => bool claimed)) public claimed;

    event RootRegistered(bytes32 indexed root, address indexed registeredBy);
    event Claimed(bytes32 indexed root, address indexed beneficiary, uint256 amount);

    error RootInactive();
    error AlreadyClaimed();
    error InvalidProof();
    error InsufficientBalance();

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
        if (IERC20(address(token)).balanceOf(address(this)) < amount) revert InsufficientBalance();
        IERC20(address(token)).safeTransfer(beneficiary, amount);
        emit Claimed(root, beneficiary, amount);
    }

    /// @dev Transfers DIR from this contract balance (fund contract first).
    function payout(address beneficiary, uint256 amount) external onlyOwner {
        if (IERC20(address(token)).balanceOf(address(this)) < amount) revert InsufficientBalance();
        IERC20(address(token)).safeTransfer(beneficiary, amount);
        emit Claimed(bytes32(0), beneficiary, amount);
    }
}
