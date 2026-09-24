// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IPerpsEngine} from "../interfaces/IPerpsEngine.sol";
import {IPyth} from "../interfaces/IPyth.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";
import {PerpsMath} from "./PerpsMath.sol";
import {PerpsStorage} from "./PerpsStorage.sol";
import {
    AccessControlDefaultAdminRulesUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlDefaultAdminRulesUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title PerpsBase
/// @notice What the perps modules share: roles, the risk constants, and the account arithmetic. Pricing,
/// valuing, filling and closing live here once, so trading and settlement cannot disagree about them.
abstract contract PerpsBase is
    IPerpsEngine,
    PerpsStorage,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient
{
    using SafeCast for uint256;
    using SafeCast for int256;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Virtual balance every account starts with, USD 1e18.
    int256 public constant STARTING_BALANCE = 10_000e18;
    /// @notice Taker fee on every fill.
    uint256 public constant FEE_BPS = 5;
    /// @notice Leverage cap of a tournament whose organizer never set one: every tournament offers 100x unless
    /// its host deliberately chose less.
    uint256 public constant DEFAULT_LEVERAGE = 100;
    /// @notice Maintenance margin is half the initial margin: `MAINTENANCE_NUMERATOR / cap` basis points, so
    /// 1,000 at 5x, 250 at 20x and 50 at 100x. An account is liquidatable under that share of its notional.
    uint256 public constant MAINTENANCE_NUMERATOR = 5000;
    /// @notice Pyth's confidence interval must stay under a quarter of the maintenance margin, or a fill at the
    /// cap could be inside the noise: 250 bps at 5x, 62 at 20x, 12 at 100x.
    uint256 public constant CONF_DIVISOR = 4;
    /// @notice Fills use a price at most this old. The trader brings the update, so this is how far back they
    /// can shop for a price; at 100x a thirty-second window would be worth a third of the account.
    uint256 public constant MAX_PRICE_AGE = 10;
    /// @notice Settlement accepts the first price published within this many seconds after the end.
    uint64 public constant SETTLE_WINDOW = 60;

    struct Fill {
        uint256 price;
        int256 realized;
        uint256 fee;
        int256 newSize;
        int256 balance;
        bool addsRisk;
    }

    /// @dev Reverts unless the tournament trades here, is running, and `trader` joined it.
    function _requireTrader(Layout storage $, uint256 tournamentId, address trader) internal view {
        ITournamentManager.Config memory config = $.manager.getConfig(tournamentId);
        if (config.venue != $.adapter) revert WrongVenue(config.venue);
        if (block.timestamp < config.startTime || block.timestamp >= config.endTime) {
            revert TradingClosed(config.startTime, config.endTime);
        }
        // The adapter only admits participants who are their own trading account.
        if ($.manager.tradingAccountOf(tournamentId, trader) != trader) revert NotAParticipant(trader);
    }

    /// @dev The exact fee is required, so the engine never holds or refunds MON.
    function _fee(Layout storage $, bytes[] calldata priceUpdate) internal view returns (uint256 fee) {
        fee = $.pyth.getUpdateFee(priceUpdate);
        if (msg.value != fee) revert IncorrectFee(fee);
    }

    function _pushPrices(Layout storage $, bytes[] calldata priceUpdate) internal {
        // `pyth` is fixed at initialization and the value is the fee it quoted.
        // forge-lint: disable-next-line(arbitrary-send-eth)
        $.pyth.updatePriceFeeds{value: _fee($, priceUpdate)}(priceUpdate);
    }

    /// @dev Applies a fill to an account. Returned in memory: the `Traded` event needs more values than the
    /// stack can hold next to the caller's own.
    function _fill(Account storage a, bytes32 market, int256 sizeDelta, uint256 price)
        internal
        returns (Fill memory f)
    {
        Position storage p = a.positions[market];
        int256 size = p.size;
        (p.size, p.entryPrice, f.realized) = PerpsMath.applyFill(size, p.entryPrice, sizeDelta, price);
        f.fee = PerpsMath.fee(sizeDelta, price, FEE_BPS);
        a.realized += f.realized - f.fee.toInt256();

        if (size == 0) {
            a.openMarkets.push(market);
        } else if (p.size == 0) {
            _remove(a.openMarkets, market);
            if (a.openMarkets.length == 0) _floor(a);
        }

        (f.price, f.newSize, f.balance) = (price, p.size, STARTING_BALANCE + a.realized);
        f.addsRisk = PerpsMath.addsRisk(size, p.size);
    }

    /// @dev Fresh, confident price of `market` in USD 1e18. Called once per open market: an account is valued
    /// whole or not at all, so one unusable price must fail the call. The loop is over the account's own
    /// markets, which only its owner can grow.
    function _cap(Layout storage $, uint256 tournamentId) internal view returns (uint256 cap) {
        cap = $.leverageCaps[tournamentId];
        if (cap == 0) cap = DEFAULT_LEVERAGE;
    }

    function _maintenanceBps(uint256 cap) internal pure returns (uint256) {
        return MAINTENANCE_NUMERATOR / cap;
    }

    function _price(Layout storage $, bytes32 market, uint256 cap) internal view returns (uint256 price) {
        bool confident;
        (price,, confident) = _quote($, market, cap);
        if (!confident) {
            // forge-lint: disable-next-line(require-revert-in-loop)
            revert PriceTooUncertain(market);
        }
    }

    /// @dev Price for a fill that only reduces or closes. A trader can always get out: with a confident price at
    /// the price, and with an uncertain one at the edge of its band that is worse for them, so the oracle's doubt
    /// is never theirs to profit from. Selling (`sizeDelta < 0`) takes price minus confidence, buying plus.
    function _exitPrice(Layout storage $, bytes32 market, uint256 cap, int256 sizeDelta)
        internal
        view
        returns (uint256 price)
    {
        (uint256 mid, uint256 band, bool confident) = _quote($, market, cap);
        if (confident) return mid;
        if (sizeDelta > 0) return mid + band;
        // A band as wide as the price leaves nothing to sell at.
        if (band >= mid) revert PriceTooUncertain(market);
        return mid - band;
    }

    /// @dev Fresh Pyth price of `market` in USD 1e18, its confidence band in the same units, and whether the band
    /// is inside the cap's limit: conf / price <= (maintenance / CONF_DIVISOR), maintenance = NUMERATOR / cap,
    /// cross-multiplied so nothing is divided. `toWad` rejects non-positive prices; `conf` shares the exponent.
    function _quote(Layout storage $, bytes32 market, uint256 cap)
        internal
        view
        returns (uint256 price, uint256 band, bool confident)
    {
        // forge-lint: disable-next-line(calls-loop)
        IPyth.Price memory quote = $.pyth.getPriceNoOlderThan(market, MAX_PRICE_AGE);
        price = PerpsMath.toWad(quote.price, quote.expo);
        band = PerpsMath.scale(quote.conf, quote.expo);
        // forge-lint: disable-next-line(unsafe-typecast)
        confident =
            quote.conf * PerpsMath.BPS * CONF_DIVISOR * cap <= uint256(uint64(quote.price)) * MAINTENANCE_NUMERATOR;
    }

    /// @dev Current price of every open market, in `openMarkets` order.
    function _prices(Layout storage $, Account storage a, uint256 cap) internal view returns (uint256[] memory prices) {
        uint256 count = a.openMarkets.length;
        prices = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            prices[i] = _price($, a.openMarkets[i], cap);
        }
    }

    /// @dev Equity (cash plus unrealized profit) and total notional of an account at `prices`.
    function _risk(Account storage a, uint256[] memory prices) internal view returns (int256 equity, uint256 notional) {
        equity = STARTING_BALANCE + a.realized;
        for (uint256 i; i < prices.length; ++i) {
            Position storage p = a.positions[a.openMarkets[i]];
            equity += PerpsMath.pnl(p.size, p.entryPrice, prices[i]);
            notional += PerpsMath.notional(p.size, prices[i]);
        }
    }

    /// @dev Closes every position at `prices` without a fee and floors the balance: a paper account cannot owe.
    function _closeAll(Account storage a, uint256[] memory prices) internal {
        for (uint256 i; i < prices.length; ++i) {
            bytes32 market = a.openMarkets[i];
            Position storage p = a.positions[market];
            a.realized += PerpsMath.pnl(p.size, p.entryPrice, prices[i]);
            delete a.positions[market];
        }
        delete a.openMarkets;
        _floor(a);
    }

    function _floor(Account storage a) internal {
        if (a.realized < -STARTING_BALANCE) a.realized = -STARTING_BALANCE;
    }

    /// @dev Swap and pop. `market` is always present: callers remove a market only when closing its position.
    function _remove(bytes32[] storage markets, bytes32 market) internal {
        uint256 i = 0;
        while (markets[i] != market) ++i;
        markets[i] = markets[markets.length - 1];
        markets.pop();
    }
}
