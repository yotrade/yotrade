// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IAccountCore} from "./interfaces/IAccountCore.sol";
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

    /// @param admin Receives the admin, pauser and upgrader roles.
    /// @param scorer Receives the scorer role.
    /// @param accountCore_ Kuru `AccountCore` proxy. Zero disables onchain trading-account checks.
    /// @param disputeWindow_ Seconds between results being posted and prizes becoming claimable.
    function initialize(address admin, address scorer, address accountCore_, uint64 disputeWindow_)
        external
        initializer
    {
        if (admin == address(0) || scorer == address(0)) revert ZeroAddress();
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(SCORER_ROLE, scorer);

        _setAccountCore(accountCore_);
        _setDisputeWindow(disputeWindow_);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------------------------------------------

    function setAccountCore(address accountCore_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setAccountCore(accountCore_);
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

    function accountCore() external view returns (address) {
        return address(_layout().accountCore);
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

    function _setAccountCore(address accountCore_) private {
        _layout().accountCore = IAccountCore(accountCore_);
        emit AccountCoreUpdated(accountCore_);
    }

    function _setDisputeWindow(uint64 disputeWindow_) private {
        if (disputeWindow_ > MAX_DISPUTE_WINDOW) revert InvalidSchedule();
        _layout().disputeWindow = disputeWindow_;
        emit DisputeWindowUpdated(disputeWindow_);
    }
}
