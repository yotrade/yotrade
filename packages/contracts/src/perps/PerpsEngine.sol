// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IPerpsEngine} from "../interfaces/IPerpsEngine.sol";
import {IPyth} from "../interfaces/IPyth.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";
import {PerpsSettlementModule} from "./modules/PerpsSettlementModule.sol";
import {PerpsTradingModule} from "./modules/PerpsTradingModule.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title PerpsEngine
/// @notice The futures venue of YoTrade tournaments: cross-margin paper perpetuals priced by Pyth.
/// @dev Entry point behind one UUPS proxy: initialization, the market switch, the pause and the reads. Trading
/// lives in `PerpsTradingModule`, liquidation and settlement in `PerpsSettlementModule`, the arithmetic they
/// share in `PerpsBase`. Accounts are keyed by `(tournament, trader)` and need no setup; the tournament's
/// schedule and roster are read from the TournamentManager, so the engine holds no copy that could drift.
contract PerpsEngine is PerpsTradingModule, PerpsSettlementModule, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param admin The single default admin. Also receives the pauser and upgrader roles.
    /// @param adapter The `PerpsVenueAdapter` tournaments name as their venue.
    /// @param adminTransferDelay Seconds a new default admin must wait before accepting the role.
    function initialize(
        address admin,
        ITournamentManager manager,
        IPyth pyth,
        address adapter,
        uint48 adminTransferDelay
    ) external initializer {
        if (
            admin == address(0) || address(manager) == address(0) || address(pyth) == address(0)
                || adapter == address(0)
        ) revert ZeroAddress();
        __AccessControlDefaultAdminRules_init(adminTransferDelay, admin);
        __Pausable_init();

        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);

        Layout storage $ = _layout();
        ($.manager, $.pyth, $.adapter) = (manager, pyth, adapter);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------------------------------------------

    /// @notice Enables or disables a Pyth feed as a market. Enable only feeds that publish around the clock:
    /// a feed that pauses (metals, equities) cannot settle a tournament that ends while it is closed.
    function setMarket(bytes32 market, bool enabled) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _layout().markets[market] = enabled;
        emit MarketUpdated(market, enabled);
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

    /// @inheritdoc IPerpsEngine
    function accountOf(uint256 tournamentId, address trader)
        external
        view
        returns (int256 balance, bytes32[] memory openMarkets)
    {
        Account storage a = _layout().accounts[tournamentId][trader];
        return (STARTING_BALANCE + a.realized, a.openMarkets);
    }

    /// @inheritdoc IPerpsEngine
    function positionOf(uint256 tournamentId, address trader, bytes32 market) external view returns (Position memory) {
        return _layout().accounts[tournamentId][trader].positions[market];
    }

    /// @inheritdoc IPerpsEngine
    function isMarketEnabled(bytes32 market) external view returns (bool) {
        return _layout().markets[market];
    }

    /// @inheritdoc IPerpsEngine
    function leverageCapOf(uint256 tournamentId) external view returns (uint256) {
        return _cap(_layout(), tournamentId);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
