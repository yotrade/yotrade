// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentBase} from "../TournamentBase.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";

/// @title LensModule
/// @notice Every read. Nothing here writes, so the rest of the contract can be reasoned about without it.
abstract contract LensModule is TournamentBase {
    /// @inheritdoc ITournamentManager
    function isVenueApproved(address venue) external view returns (bool) {
        return _layout().approvedVenues[venue];
    }

    /// @inheritdoc ITournamentManager
    function escrowed(address token) external view returns (uint256) {
        return _layout().escrowed[token];
    }

    function disputeWindow() external view returns (uint64) {
        return _layout().disputeWindow;
    }

    /// @inheritdoc ITournamentManager
    function tournamentCount() external view returns (uint256) {
        return _layout().count;
    }

    /// @inheritdoc ITournamentManager
    function getConfig(uint256 id) external view returns (Config memory) {
        return _layout().tournaments[id].config;
    }

    /// @inheritdoc ITournamentManager
    function getState(uint256 id)
        external
        view
        returns (address organizer, Status status, uint32 participantCount, uint64 claimableAt, uint256 unpaid)
    {
        Tournament storage t = _layout().tournaments[id];
        return (t.organizer, t.status, t.participantCount, t.claimableAt, t.unpaid);
    }

    /// @inheritdoc ITournamentManager
    function getWinners(uint256 id) external view returns (address[] memory) {
        return _layout().tournaments[id].winners;
    }

    /// @inheritdoc ITournamentManager
    function tradingAccountOf(uint256 id, address participant) external view returns (address) {
        return _layout().tournaments[id].tradingAccountOf[participant];
    }

    /// @inheritdoc ITournamentManager
    function capitalAtJoin(uint256 id, address participant) external view returns (uint256) {
        return _layout().tournaments[id].capitalAtJoin[participant];
    }

    /// @inheritdoc ITournamentManager
    function prizeOf(uint256 id, address account) external view returns (uint256 amount, bool claimed) {
        Tournament storage t = _layout().tournaments[id];
        uint256 rankPlusOne = t.rankOf[account];
        if (rankPlusOne != 0) {
            amount = _prize(t, rankPlusOne - 1);
            claimed = t.claimed[account];
        }
    }

    /// @inheritdoc ITournamentManager
    function inviteSignerOf(uint256 id) external view returns (address) {
        return _layout().inviteSigners[id];
    }
}
