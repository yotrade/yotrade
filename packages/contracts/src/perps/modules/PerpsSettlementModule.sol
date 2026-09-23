// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IPerpsEngine} from "../../interfaces/IPerpsEngine.sol";
import {IPyth} from "../../interfaces/IPyth.sol";
import {ITournamentManager} from "../../interfaces/ITournamentManager.sol";
import {PerpsBase} from "../PerpsBase.sol";
import {PerpsMath} from "../PerpsMath.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title PerpsSettlementModule
/// @notice How positions end without their owner: liquidation under maintenance while the tournament runs, and
/// settlement at the first oracle price after it. Anyone may call either.
abstract contract PerpsSettlementModule is PerpsBase {
    using SafeCast for uint256;
    using SafeCast for int256;

    /// @inheritdoc IPerpsEngine
    function liquidate(uint256 tournamentId, address trader, bytes[] calldata priceUpdate)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        Layout storage $ = _layout();
        ITournamentManager.Config memory config = $.manager.getConfig(tournamentId);
        // After the end only `settle` may close positions, at the end price.
        if (block.timestamp >= config.endTime) revert TradingClosed(config.startTime, config.endTime);
        _pushPrices($, priceUpdate);

        Account storage a = $.accounts[tournamentId][trader];
        uint256 cap = _cap($, tournamentId);
        uint256[] memory prices = _prices($, a, cap);
        (int256 equity, uint256 notional) = _risk(a, prices);
        if (equity * PerpsMath.BPS.toInt256() >= (notional * _maintenanceBps(cap)).toInt256()) {
            revert NotLiquidatable();
        }

        _closeAll(a, prices);
        emit Liquidated(tournamentId, trader, msg.sender, STARTING_BALANCE + a.realized);
    }

    /// @inheritdoc IPerpsEngine
    function settle(uint256 tournamentId, address trader, bytes[] calldata priceUpdate) external payable nonReentrant {
        Layout storage $ = _layout();
        uint64 endTime = $.manager.getConfig(tournamentId).endTime;
        if (block.timestamp < endTime) revert TournamentNotEnded(endTime);

        Account storage a = $.accounts[tournamentId][trader];
        bytes32[] memory markets = a.openMarkets;
        if (markets.length == 0) revert NothingToSettle();

        // The first update at or after the end, per market: whoever settles, the price is the same.
        // `pyth` is fixed at initialization and the value is the fee it quoted.
        // forge-lint: disable-start(arbitrary-send-eth)
        IPyth.PriceFeed[] memory feeds = $.pyth.parsePriceFeedUpdatesUnique{value: _fee($, priceUpdate)}(
            priceUpdate, markets, endTime, endTime + SETTLE_WINDOW
        );
        // forge-lint: disable-end(arbitrary-send-eth)
        uint256[] memory prices = new uint256[](markets.length);
        for (uint256 i; i < markets.length; ++i) {
            prices[i] = PerpsMath.toWad(feeds[i].price.price, feeds[i].price.expo);
        }

        _closeAll(a, prices);
        emit Settled(tournamentId, trader, STARTING_BALANCE + a.realized);
    }
}
