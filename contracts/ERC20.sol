// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WYStakeToken is ERC20 {
    address public owner;
    constructor() ERC20("WYStakeToken", "WY") {
        owner = msg.sender;
    }

    function mint(uint256 amount) public {
        require(msg.sender == owner, "Only owner can mint tokens");
        _mint(owner, amount);
    }
}