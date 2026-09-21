// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title IVenueAdapter
/// @notice Connects the tournament core to one trading venue. Adding a venue means adding an adapter, not changing
/// the core. Adapters are approved by the admin and must be stateless views.
interface IVenueAdapter {
    error AccountNotRegistered(address tradingAccount);
    error NotAccountOwner(address tradingAccount, address participant);

    /// @notice Proves that `participant` controls `tradingAccount` on the venue.
    /// @dev Must revert when the account is unknown or controlled by someone else.
    /// @return capital Free balance of `capitalToken` held by the trading account, in token units.
    function checkAccount(address participant, address tradingAccount, address capitalToken)
        external
        view
        returns (uint256 capital);
}
