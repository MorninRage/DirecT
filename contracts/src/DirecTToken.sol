// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/// @title DirecTToken (DIR) — ERC-20 with voting snapshots and permit, for L2 deployment.
/// @dev Fixed supply cap of 1B DIR (18 decimals). Minting allowed only while totalSupply + amount <= MAX_SUPPLY.
contract DirecTToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    mapping(address account => bool) public minters;

    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** 18; // 1e9 DIR

    error NotMinter();
    error SupplyCapExceeded();

    constructor(address initialOwner) ERC20("DirecT", "DIR") ERC20Permit("DirecT") Ownable(initialOwner) {
        minters[initialOwner] = true;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minters[account] = allowed;
    }

    function mint(address to, uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter();
        if (totalSupply() + amount > MAX_SUPPLY) revert SupplyCapExceeded();
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // --- Overrides ---

    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
