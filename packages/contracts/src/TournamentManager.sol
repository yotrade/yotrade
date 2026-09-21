// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ITournamentManager} from "./interfaces/ITournamentManager.sol";
import {EscrowModule} from "./modules/EscrowModule.sol";
import {RegistrationModule} from "./modules/RegistrationModule.sol";
import {ResultsModule} from "./modules/ResultsModule.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title TournamentManager
/// @notice Registry and prize escrow for community trading tournaments.
/// @dev Entry point behind one UUPS proxy. Behaviour lives in the modules, all sharing `TournamentStorage`:
/// `EscrowModule` (pool in and back out), `RegistrationModule` (join) and `ResultsModule` (score, dispute, claim).
contract TournamentManager is EscrowModule, RegistrationModule, ResultsModule, UUPSUpgradeable {
    uint64 public constant MAX_DISPUTE_WINDOW = 7 days;

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

    // ---------------------------------------------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Approves or revokes a venue adapter. Revoking does not affect tournaments already created.
    function setVenueApproval(address venue, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (venue == address(0)) revert ZeroAddress();
        _layout().approvedVenues[venue] = approved;
        emit VenueApprovalUpdated(venue, approved);
    }

    function setDisputeWindow(uint64 disputeWindow_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDisputeWindow(disputeWindow_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------------------

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

    // ---------------------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    function _setDisputeWindow(uint64 disputeWindow_) private {
        if (disputeWindow_ > MAX_DISPUTE_WINDOW) revert InvalidSchedule();
        _layout().disputeWindow = disputeWindow_;
        emit DisputeWindowUpdated(disputeWindow_);
    }
}
