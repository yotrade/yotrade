// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IVenueAdapter} from "../interfaces/IVenueAdapter.sol";

/// @title PerpsVenueAdapter
/// @notice Venue adapter for the paper perps engine. The trading account is the participant: the engine keys
/// accounts by `(tournament, trader)`, so there is nothing else to own. Everyone gets the same virtual capital,
/// which the tournament records as `capitalAtJoin`.
contract PerpsVenueAdapter is IVenueAdapter {
    /// @notice Virtual starting capital in USD with six decimals, the unit tournaments use for capital.
    uint256 public constant STARTING_CAPITAL = 10_000e6;

    /// @inheritdoc IVenueAdapter
    /// @dev `capitalToken` is ignored: the capital is virtual and the same for every participant.
    function checkAccount(address participant, address tradingAccount, address)
        external
        pure
        returns (uint256 capital)
    {
        if (tradingAccount != participant) {
            revert NotAccountOwner(tradingAccount, participant);
        }
        return STARTING_CAPITAL;
    }
}
