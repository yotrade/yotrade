// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ITournamentManager} from "../interfaces/ITournamentManager.sol";

/// @title PrizeSplit
/// @notice Validation and arithmetic for a prize pool divided by rank, in basis points.
library PrizeSplit {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_WINNERS = 20;

    /// @dev Reverts unless there are 1 to `MAX_WINNERS` non-zero shares summing to exactly `BPS`.
    function validate(uint16[] calldata split) internal pure {
        uint256 length = split.length;
        if (length == 0 || length > MAX_WINNERS) revert ITournamentManager.InvalidSplit();
        uint256 total = 0;
        for (uint256 i; i < length; ++i) {
            // Bounded input validation; reverting on the first bad share is intended.
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (split[i] == 0) revert ITournamentManager.InvalidSplit();
            total += split[i];
        }
        if (total != BPS) revert ITournamentManager.InvalidSplit();
    }

    /// @dev Rounds down. The remainder stays in the pool and is returned to the organizer by `sweep`.
    function prize(uint256 pool, uint16 shareBps) internal pure returns (uint256) {
        return (pool * shareBps) / BPS;
    }
}
