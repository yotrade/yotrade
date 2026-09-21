// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title IPerpsEngine
/// @notice Paper perpetuals for tournaments. Every account starts with the same virtual balance, fills at the
/// Pyth price pushed with the trade, and is settled at the first Pyth price at or after the tournament's end.
/// Nothing of value is held: what the engine protects is the fairness of the score.
interface IPerpsEngine {
    struct Position {
        /// Signed base units, 1e18. Positive is long.
        int256 size;
        /// Volume-weighted entry, USD 1e18. Zero when flat.
        uint256 entryPrice;
    }

    event MarketUpdated(bytes32 indexed market, bool enabled);
    event Traded(
        uint256 indexed tournamentId,
        address indexed trader,
        bytes32 indexed market,
        int256 sizeDelta,
        uint256 price,
        int256 realizedPnl,
        uint256 fee,
        int256 newSize,
        int256 balance
    );
    event Liquidated(uint256 indexed tournamentId, address indexed trader, address indexed liquidator, int256 balance);
    event Settled(uint256 indexed tournamentId, address indexed trader, int256 balance);

    error ZeroAddress();
    error ZeroSize();
    error NotAParticipant(address trader);
    error WrongVenue(address venue);
    error TradingClosed(uint64 startTime, uint64 endTime);
    error TournamentNotEnded(uint64 endTime);
    error MarketDisabled(bytes32 market);
    error PriceTooUncertain(bytes32 market);
    error ExceedsLeverage(uint256 notional, uint256 allowed);
    error NotLiquidatable();
    error NothingToSettle();
    error IncorrectFee(uint256 required);

    /// @notice Fills `sizeDelta` of `market` for the caller at the Pyth price carried by `priceUpdate`.
    /// @dev `priceUpdate` must cover `market` and, when the fill adds risk, every market the caller already has a
    /// position in: the leverage check values the whole account. `msg.value` must equal Pyth's update fee.
    function trade(uint256 tournamentId, bytes32 market, int256 sizeDelta, bytes[] calldata priceUpdate)
        external
        payable;

    /// @notice Closes every position of an account whose equity fell under the maintenance margin and floors its
    /// balance at zero. Anyone may call while the tournament runs.
    function liquidate(uint256 tournamentId, address trader, bytes[] calldata priceUpdate) external payable;

    /// @notice After the end, closes every position at the first Pyth price at or after the end time.
    /// Anyone may call; nobody can choose the price.
    function settle(uint256 tournamentId, address trader, bytes[] calldata priceUpdate) external payable;

    /// @notice Cash balance (USD 1e18) and the markets the account has positions in. An account that never
    /// traded reports the starting balance.
    function accountOf(uint256 tournamentId, address trader)
        external
        view
        returns (int256 balance, bytes32[] memory openMarkets);

    function positionOf(uint256 tournamentId, address trader, bytes32 market) external view returns (Position memory);

    function isMarketEnabled(bytes32 market) external view returns (bool);
}
