// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IAccountCore} from "../interfaces/IAccountCore.sol";
import {IVenueAdapter} from "../interfaces/IVenueAdapter.sol";

/// @title KuruVenueAdapter
/// @notice Venue adapter for Kuru Spot V2. A trading account is any address registered in `AccountCore`, root or
/// subaccount, whose root owner is the participant.
contract KuruVenueAdapter is IVenueAdapter {
    IAccountCore public immutable ACCOUNT_CORE;

    error ZeroAddress();

    constructor(IAccountCore accountCore) {
        if (address(accountCore) == address(0)) revert ZeroAddress();
        ACCOUNT_CORE = accountCore;
    }

    /// @inheritdoc IVenueAdapter
    function checkAccount(address participant, address tradingAccount, address capitalToken)
        external
        view
        returns (uint256 capital)
    {
        if (ACCOUNT_CORE.userRegistry(tradingAccount) == 0) revert AccountNotRegistered(tradingAccount);
        if (ACCOUNT_CORE.getAccountOwner(tradingAccount) != participant) {
            revert NotAccountOwner(tradingAccount, participant);
        }
        // Free balance only: funds already reserved by open orders are not starting capital.
        return capitalToken == address(0) ? 0 : ACCOUNT_CORE.getBalance(tradingAccount, capitalToken);
    }
}
