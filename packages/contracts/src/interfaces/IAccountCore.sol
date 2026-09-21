// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title IAccountCore
/// @notice Minimal view surface of Kuru Spot V2 `AccountCore` used to validate trading accounts.
interface IAccountCore {
    /// @notice AccountCore id of a root or subaccount address. Zero means unregistered.
    function userRegistry(address user) external view returns (uint40 id);

    /// @notice Root owner of a root or subaccount. Zero for unknown addresses.
    function getAccountOwner(address account) external view returns (address root);

    /// @notice Free balance of `token` held by `user`, excluding order reserves and passive inventory.
    function getBalance(address user, address token) external view returns (uint256 balance);
}
