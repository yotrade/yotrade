// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {AdminModule} from "./modules/AdminModule.sol";
import {EscrowModule} from "./modules/EscrowModule.sol";
import {HostModule} from "./modules/HostModule.sol";
import {LensModule} from "./modules/LensModule.sol";
import {RegistrationModule} from "./modules/RegistrationModule.sol";
import {ResultsModule} from "./modules/ResultsModule.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title TournamentManager
/// @notice Registry and prize escrow for community trading tournaments.
/// @dev Entry point behind one UUPS proxy. It only initializes and authorizes upgrades; behaviour lives in the
/// modules, all sharing `TournamentStorage`:
/// - `EscrowModule`: the prize pool in, and back out to the organizer (create, cancel, reclaim, sweep).
/// - `HostModule`: what the organizer changes afterwards (metadata, start now, invite).
/// - `RegistrationModule`: who may enter, with which trading account.
/// - `ResultsModule`: scoring, the dispute window and claims.
/// - `AdminModule`: venues, the dispute window length, the pause and rescue of stray tokens.
/// - `LensModule`: every read.
contract TournamentManager is
    EscrowModule,
    HostModule,
    RegistrationModule,
    ResultsModule,
    AdminModule,
    LensModule,
    UUPSUpgradeable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param admin The single default admin. Also receives the pauser and upgrader roles.
    /// @param scorer Receives the scorer role.
    /// @param disputeWindow_ Seconds between results being posted and prizes becoming claimable.
    /// @param adminTransferDelay Seconds a new default admin must wait before accepting the role.
    function initialize(address admin, address scorer, uint64 disputeWindow_, uint48 adminTransferDelay)
        external
        initializer
    {
        if (admin == address(0) || scorer == address(0)) revert ZeroAddress();
        __AccessControlDefaultAdminRules_init(adminTransferDelay, admin);
        __Pausable_init();

        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(SCORER_ROLE, scorer);

        _setDisputeWindow(disputeWindow_);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
