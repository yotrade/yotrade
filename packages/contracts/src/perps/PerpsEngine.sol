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
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title PerpsEngine
/// @notice The futures venue of YoTrade tournaments: cross-margin paper perpetuals priced by Pyth.
/// @dev Accounts are keyed by `(tournament, trader)` and need no setup. The tournament's schedule and roster are
/// read from the TournamentManager, so the engine holds no copy that could drift.
contract PerpsEngine is
    IPerpsEngine,
    PerpsStorage,
    AccessControlDefaultAdminRulesUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    using SafeCast for uint256;
    using SafeCast for int256;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Virtual balance every account starts with, USD 1e18.
    int256 public constant STARTING_BALANCE = 10_000e18;
    /// @notice Taker fee on every fill.
    uint256 public constant FEE_BPS = 5;
    /// @notice A fill that adds risk must leave total notional within this multiple of equity.
    uint256 public constant MAX_LEVERAGE = 20;
    /// @notice An account is liquidatable once equity is under this share of its total notional.
    uint256 public constant MAINTENANCE_BPS = 250;
    /// @notice Fills use a price at most this old, which bounds how far back a trader can pick a price. Wide
    /// enough for Hermes plans that refresh every ten seconds; any newer price someone pushed wins regardless.
    uint256 public constant MAX_PRICE_AGE = 30;
    /// @notice Fills are refused while Pyth's confidence interval is wider than this share of the price.
    uint256 public constant MAX_CONF_BPS = 200;
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
    // Trading
    // ---------------------------------------------------------------------------------------------------------

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
        Fill memory f = _fill(a, market, sizeDelta, _price($, market));
        if (f.addsRisk) {
            // Only fills that add risk are checked, so a trader can always reduce, even in a disabled market.
            if (!$.markets[market]) revert MarketDisabled(market);
            (int256 equity, uint256 notional) = _risk(a, _prices($, a));
            uint256 allowed = equity > 0 ? equity.toUint256() * MAX_LEVERAGE : 0;
            if (notional > allowed) revert ExceedsLeverage(notional, allowed);
        }
        emit Traded(tournamentId, msg.sender, market, sizeDelta, f.price, f.realized, f.fee, f.newSize, f.balance);
    }

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
        uint256[] memory prices = _prices($, a);
        (int256 equity, uint256 notional) = _risk(a, prices);
        if (equity * PerpsMath.BPS.toInt256() >= (notional * MAINTENANCE_BPS).toInt256()) revert NotLiquidatable();

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

    // ---------------------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    /// @dev Reverts unless the tournament trades here, is running, and `trader` joined it.
    function _requireTrader(Layout storage $, uint256 tournamentId, address trader) private view {
        ITournamentManager.Config memory config = $.manager.getConfig(tournamentId);
        if (config.venue != $.adapter) revert WrongVenue(config.venue);
        if (block.timestamp < config.startTime || block.timestamp >= config.endTime) {
            revert TradingClosed(config.startTime, config.endTime);
        }
        // The adapter only admits participants who are their own trading account.
        if ($.manager.tradingAccountOf(tournamentId, trader) != trader) revert NotAParticipant(trader);
    }

    /// @dev The exact fee is required, so the engine never holds or refunds MON.
    function _fee(Layout storage $, bytes[] calldata priceUpdate) private view returns (uint256 fee) {
        fee = $.pyth.getUpdateFee(priceUpdate);
        if (msg.value != fee) revert IncorrectFee(fee);
    }

    function _pushPrices(Layout storage $, bytes[] calldata priceUpdate) private {
        // `pyth` is fixed at initialization and the value is the fee it quoted.
        // forge-lint: disable-next-line(arbitrary-send-eth)
        $.pyth.updatePriceFeeds{value: _fee($, priceUpdate)}(priceUpdate);
    }

    /// @dev Applies a fill to an account. Returned in memory: the `Traded` event needs more values than the
    /// stack can hold next to the caller's own.
    function _fill(Account storage a, bytes32 market, int256 sizeDelta, uint256 price) private returns (Fill memory f) {
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
        f.addsRisk = PerpsMath.abs(p.size) > PerpsMath.abs(size);
    }

    /// @dev Fresh, confident price of `market` in USD 1e18. Called once per open market: an account is valued
    /// whole or not at all, so one unusable price must fail the call. The loop is over the account's own
    /// markets, which only its owner can grow.
    function _price(Layout storage $, bytes32 market) private view returns (uint256 price) {
        // forge-lint: disable-next-line(calls-loop)
        IPyth.Price memory quote = $.pyth.getPriceNoOlderThan(market, MAX_PRICE_AGE);
        price = PerpsMath.toWad(quote.price, quote.expo);
        // `toWad` rejected non-positive prices, and `conf` shares the price's exponent.
        // forge-lint: disable-next-line(unsafe-typecast)
        if (quote.conf > uint256(uint64(quote.price)) * MAX_CONF_BPS / PerpsMath.BPS) {
            // forge-lint: disable-next-line(require-revert-in-loop)
            revert PriceTooUncertain(market);
        }
    }

    /// @dev Current price of every open market, in `openMarkets` order.
    function _prices(Layout storage $, Account storage a) private view returns (uint256[] memory prices) {
        uint256 count = a.openMarkets.length;
        prices = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            prices[i] = _price($, a.openMarkets[i]);
        }
    }

    /// @dev Equity (cash plus unrealized profit) and total notional of an account at `prices`.
    function _risk(Account storage a, uint256[] memory prices) private view returns (int256 equity, uint256 notional) {
        equity = STARTING_BALANCE + a.realized;
        for (uint256 i; i < prices.length; ++i) {
            Position storage p = a.positions[a.openMarkets[i]];
            equity += PerpsMath.pnl(p.size, p.entryPrice, prices[i]);
            notional += PerpsMath.notional(p.size, prices[i]);
        }
    }

    /// @dev Closes every position at `prices` without a fee and floors the balance: a paper account cannot owe.
    function _closeAll(Account storage a, uint256[] memory prices) private {
        for (uint256 i; i < prices.length; ++i) {
            bytes32 market = a.openMarkets[i];
            Position storage p = a.positions[market];
            a.realized += PerpsMath.pnl(p.size, p.entryPrice, prices[i]);
            delete a.positions[market];
        }
        delete a.openMarkets;
        _floor(a);
    }

    function _floor(Account storage a) private {
        if (a.realized < -STARTING_BALANCE) a.realized = -STARTING_BALANCE;
    }

    /// @dev Swap and pop. `market` is always present: callers remove a market only when closing its position.
    function _remove(bytes32[] storage markets, bytes32 market) private {
        uint256 i = 0;
        while (markets[i] != market) ++i;
        markets[i] = markets[markets.length - 1];
        markets.pop();
    }
}
