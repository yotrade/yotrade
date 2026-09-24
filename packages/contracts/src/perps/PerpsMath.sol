// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @title PerpsMath
/// @notice Position arithmetic for the paper perps engine. Sizes are signed base units, prices and money are
/// unsigned or signed USD, all scaled by 1e18. Pure, so every rule here is fuzzed in isolation.
library PerpsMath {
    using SafeCast for uint256;
    using SafeCast for int256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    error InvalidPrice();

    /// @notice Converts a Pyth price to 1e18 fixed point.
    /// @dev Pyth exponents are negative in practice (crypto and metals use -8). Exponents below -18 would lose
    /// precision silently, so they are rejected together with non-positive prices.
    function toWad(int64 price, int32 expo) internal pure returns (uint256) {
        // Callers price every market of one account: a single invalid price must fail the whole valuation.
        // forge-lint: disable-next-line(require-revert-in-loop)
        if (price <= 0 || expo > 0 || expo < -18) revert InvalidPrice();
        // `price` is positive and `expo` is within [-18, 0], so neither cast can truncate or wrap.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(uint64(price)) * 10 ** uint256(uint32(18 + expo));
    }

    /// @notice An unsigned Pyth value, such as a confidence, in 1e18 at `expo`, which `toWad` already checked.
    function scale(uint64 value, int32 expo) internal pure returns (uint256) {
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(value) * 10 ** uint256(uint32(18 + expo));
    }

    /// @notice Absolute value of a size.
    function abs(int256 value) internal pure returns (uint256) {
        return value < 0 ? (-value).toUint256() : value.toUint256();
    }

    /// @notice Whether going from size `was` to size `becomes` takes on risk: a bigger position, or one on the other side.
    /// A flip is a close and a new position in one fill, and the new one must pass every check an open does.
    function addsRisk(int256 was, int256 becomes) internal pure returns (bool) {
        return abs(becomes) > abs(was) || (was > 0 && becomes < 0) || (was < 0 && becomes > 0);
    }

    /// @notice USD value of a position at `price`.
    function notional(int256 size, uint256 price) internal pure returns (uint256) {
        return (abs(size) * price) / WAD;
    }

    /// @notice Unrealized profit of a position entered at `entryPrice`, marked at `price`.
    function pnl(int256 size, uint256 entryPrice, uint256 price) internal pure returns (int256) {
        return (size * (price.toInt256() - entryPrice.toInt256())) / WAD.toInt256();
    }

    /// @notice Fee on a fill, rounded up so that splitting an order never makes it cheaper.
    function fee(int256 sizeDelta, uint256 price, uint256 feeBps) internal pure returns (uint256) {
        uint256 value = notional(sizeDelta, price) * feeBps;
        return value == 0 ? 0 : (value - 1) / BPS + 1;
    }

    /// @notice Applies a fill of `sizeDelta` at `price` to a position.
    /// @return newSize Position size after the fill.
    /// @return newEntryPrice Volume-weighted entry when adding, unchanged when reducing, `price` after a flip,
    /// zero when flat.
    /// @return realized Profit on the part of the position that the fill closed.
    function applyFill(int256 size, uint256 entryPrice, int256 sizeDelta, uint256 price)
        internal
        pure
        returns (int256 newSize, uint256 newEntryPrice, int256 realized)
    {
        newSize = size + sizeDelta;

        // Opening or adding in the same direction: nothing is realized, the entry is the weighted average.
        if (size == 0 || (size > 0) == (sizeDelta > 0)) {
            newEntryPrice = (abs(size) * entryPrice + abs(sizeDelta) * price) / abs(newSize);
            return (newSize, newEntryPrice, 0);
        }

        uint256 closed = abs(sizeDelta) < abs(size) ? abs(sizeDelta) : abs(size);
        int256 closedSigned = size > 0 ? closed.toInt256() : -closed.toInt256();
        realized = pnl(closedSigned, entryPrice, price);

        if (newSize == 0) return (0, 0, realized);
        // Reduced: the rest keeps its entry. Flipped: the new side starts at the fill price.
        newEntryPrice = (newSize > 0) == (size > 0) ? entryPrice : price;
    }
}
