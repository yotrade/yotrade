// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentBase} from "../TournamentBase.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";
import {PrizeSplit} from "../libraries/PrizeSplit.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title EscrowModule
/// @notice Everything that moves the prize pool in or back out to the organizer.
/// @dev The pool can always leave: cancel before the start, reclaim when never scored, sweep what no winner is owed.
abstract contract EscrowModule is TournamentBase {
    using SafeERC20 for IERC20;

    /// @notice Longest allowed tournament. Also rejects timestamps passed in milliseconds.
    uint64 public constant MAX_DURATION = 365 days;
    /// @notice Time after `endTime` without results before the organizer can take the pool back.
    uint64 public constant RESULTS_GRACE = 7 days;

    /// @inheritdoc ITournamentManager
    function createTournament(Config calldata config) external nonReentrant whenNotPaused returns (uint256 id) {
        if (config.startTime <= block.timestamp || config.endTime <= config.startTime) revert InvalidSchedule();
        if (config.endTime - config.startTime > MAX_DURATION) revert InvalidSchedule();
        if (config.maxParticipants == 0) revert InvalidCap();
        if (config.startingCapital != 0 && config.capitalToken == address(0)) revert ZeroAddress();
        if (config.prizePool != 0 && config.prizeToken == address(0)) revert InvalidPrizeToken();
        PrizeSplit.validate(config.prizeSplitBps);

        Layout storage $ = _layout();
        id = ++$.count;
        Tournament storage t = $.tournaments[id];
        t.organizer = msg.sender;
        t.status = Status.Open;
        t.config = config;

        // Logs before external calls: a token callback must not be able to interleave its own events.
        emit TournamentCreated(id, msg.sender, config);

        if (config.prizePool != 0) {
            IERC20 token = IERC20(config.prizeToken);
            uint256 before = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), config.prizePool);
            uint256 received = token.balanceOf(address(this)) - before;
            // Fee-on-transfer and rebasing tokens would make the pool insolvent.
            if (received != config.prizePool) revert PrizeTransferMismatch(config.prizePool, received);
            t.unpaid = received;
        }
    }

    /// @inheritdoc ITournamentManager
    /// @dev The organizer may cancel until trading starts. The admin may cancel any open tournament, for example
    /// when the venue is down.
    function cancel(uint256 id) external nonReentrant {
        Tournament storage t = _open(id);
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            if (msg.sender != t.organizer) revert NotOrganizer();
            if (block.timestamp >= t.config.startTime) revert TournamentStarted();
        }
        _refund(id, t);
    }

    /// @inheritdoc ITournamentManager
    /// @dev Guarantees the pool cannot get stuck if results are never posted.
    function reclaim(uint256 id) external nonReentrant {
        Tournament storage t = _open(id);
        if (msg.sender != t.organizer) revert NotOrganizer();
        uint64 reclaimableAt = t.config.endTime + RESULTS_GRACE;
        if (block.timestamp < reclaimableAt) revert GracePeriodActive(reclaimableAt);
        _refund(id, t);
    }

    /// @inheritdoc ITournamentManager
    /// @dev Returns whatever is not owed to an unclaimed winner: unfilled ranks and rounding dust.
    function sweep(uint256 id) external nonReentrant returns (uint256 amount) {
        Tournament storage t = _claimable(id);
        uint256 owed = 0;
        uint256 length = t.winners.length;
        for (uint256 i; i < length; ++i) {
            if (!t.claimed[t.winners[i]]) owed += _prize(t, i);
        }
        amount = t.unpaid - owed;
        if (amount == 0) revert NothingToSweep();
        t.unpaid = owed;
        emit RemainderSwept(id, amount);
        IERC20(t.config.prizeToken).safeTransfer(t.organizer, amount);
    }

    function _refund(uint256 id, Tournament storage t) private {
        uint256 amount = t.unpaid;
        t.unpaid = 0;
        t.status = Status.Cancelled;
        emit TournamentCancelled(id, amount);
        if (amount != 0) IERC20(t.config.prizeToken).safeTransfer(t.organizer, amount);
    }
}
