// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IPerpsEngine} from "../../interfaces/IPerpsEngine.sol";
import {ITournamentManager} from "../../interfaces/ITournamentManager.sol";
import {PerpsBase} from "../PerpsBase.sol";
import {PerpsMath} from "../PerpsMath.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title PerpsTradingModule
/// @notice Opening, adding to, reducing and closing positions, and the cap a host sets before the start.
abstract contract PerpsTradingModule is PerpsBase {
    using SafeCast for int256;

    /// @inheritdoc IPerpsEngine
    function trade(uint256 tournamentId, bytes32 market, int256 sizeDelta, bytes[] calldata priceUpdate)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        if (sizeDelta == 0) revert ZeroSize();
        Layout storage $ = _layout();
        _requireTrader($, tournamentId, msg.sender);
        _pushPrices($, priceUpdate);

        Account storage a = $.accounts[tournamentId][msg.sender];
        uint256 cap = _cap($, tournamentId);
        int256 size = a.positions[market].size;
        // Taking on risk needs a confident price; getting out never waits for one. See `_exitPrice`.
        uint256 price =
            PerpsMath.addsRisk(size, size + sizeDelta) ? _price($, market, cap) : _exitPrice($, market, cap, sizeDelta);
        Fill memory f = _fill(a, market, sizeDelta, price);
        if (f.addsRisk) {
            // Only fills that add risk are checked, so a trader can reduce or close even in a disabled market, over
            // the cap, or while the oracle is unsure. A flip adds risk.
            if (!$.markets[market]) revert MarketDisabled(market);
            (int256 equity, uint256 notional) = _risk(a, _prices($, a, cap));
            uint256 allowed = equity > 0 ? equity.toUint256() * cap : 0;
            if (notional > allowed) revert ExceedsLeverage(notional, allowed);
        }
        emit Traded(tournamentId, msg.sender, market, sizeDelta, f.price, f.realized, f.fee, f.newSize, f.balance);
    }

    /// @inheritdoc IPerpsEngine
    function setLeverageCap(uint256 tournamentId, uint256 cap) external {
        if (cap != 5 && cap != 20 && cap != 100) revert InvalidLeverage(cap);
        Layout storage $ = _layout();
        // Only the organizer matters here; the rest of the state is the manager's business.
        // slither-disable-start unused-return
        // forge-lint: disable-next-line(unused-return)
        (address organizer,,,,) = $.manager.getState(tournamentId);
        // slither-disable-end unused-return
        if (msg.sender != organizer) revert NotOrganizer();
        ITournamentManager.Config memory config = $.manager.getConfig(tournamentId);
        if (config.venue != $.adapter) revert WrongVenue(config.venue);
        // Traders size their positions to the cap they joined under; it cannot move once trading is possible.
        if (block.timestamp >= config.startTime) revert TournamentStarted();
        $.leverageCaps[tournamentId] = cap;
        emit LeverageCapUpdated(tournamentId, cap);
    }
}
