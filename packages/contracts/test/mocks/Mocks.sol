// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../../src/TournamentManager.sol";
import {IAccountCore} from "../../src/interfaces/IAccountCore.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Takes a 1% fee on every transfer.
contract FeeOnTransferERC20 is MockERC20 {
    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 fee = value / 100;
        super._update(from, address(0xdead), fee);
        super._update(from, to, value - fee);
    }
}

contract MockAccountCore is IAccountCore {
    mapping(address account => uint40 id) public userRegistry;
    mapping(address account => address root) public getAccountOwner;
    mapping(address account => mapping(address token => uint256 balance)) public getBalance;
    uint40 private _nextId = 1;

    function register(address account, address root) external {
        userRegistry[account] = _nextId++;
        getAccountOwner[account] = root;
    }

    function setBalance(address account, address token, uint256 balance) external {
        getBalance[account][token] = balance;
    }
}

/// @dev Upgrade target that adds one function and keeps the storage layout.
contract TournamentManagerV2 is TournamentManager {
    function version() external pure returns (uint256) {
        return 2;
    }
}
