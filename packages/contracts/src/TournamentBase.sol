// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentStorage} from "./TournamentStorage.sol";
import {ITournamentManager} from "./interfaces/ITournamentManager.sol";
import {PrizeSplit} from "./libraries/PrizeSplit.sol";
import {
    AccessControlDefaultAdminRulesUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title TournamentBase
/// @notice What every module builds on: roles, pause, reentrancy guard, shared storage and the status and
/// organizer guards.
/// @dev One default admin with a two-step, delayed transfer (`AccessControlDefaultAdminRules`).
abstract contract TournamentBase is
    ITournamentManager,
    TournamentStorage,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient
{
    bytes32 public constant SCORER_ROLE = keccak256("SCORER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public constant BPS = PrizeSplit.BPS;
    uint256 public constant MAX_WINNERS = PrizeSplit.MAX_WINNERS;
    /// @notice The URI is stored and emitted, so its size is bounded.
    uint256 public constant MAX_METADATA_LENGTH = 512;

    /// @dev Reverts unless the tournament exists and is open.
    function _open(uint256 id) internal view returns (Tournament storage t) {
        t = _layout().tournaments[id];
        if (t.status != Status.Open) revert WrongStatus(t.status);
    }

    /// @dev Reverts unless the tournament is open and the caller organizes it.
    function _hosted(uint256 id) internal view returns (Tournament storage t) {
        t = _open(id);
        _onlyOrganizer(t);
    }

    function _onlyOrganizer(Tournament storage t) internal view {
        if (msg.sender != t.organizer) revert NotOrganizer();
    }

    /// @dev Reverts unless results are posted and the dispute window has passed.
    function _claimable(uint256 id) internal view returns (Tournament storage t) {
        t = _layout().tournaments[id];
        if (t.status != Status.ResultsPosted) revert WrongStatus(t.status);
        if (block.timestamp < t.claimableAt) revert DisputeWindowActive(t.claimableAt);
    }

    /// @dev Prize for a zero-based rank.
    function _prize(Tournament storage t, uint256 rank) internal view returns (uint256) {
        return PrizeSplit.prize(t.config.prizePool, t.config.prizeSplitBps[rank]);
    }
}
