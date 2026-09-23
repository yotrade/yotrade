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
    /// @notice The URI is stored and emitted, so its size is bounded.
    uint256 public constant MAX_METADATA_LENGTH = 512;

    /// @inheritdoc ITournamentManager
    function createTournament(Config calldata config) external nonReentrant whenNotPaused returns (uint256 id) {
        if (config.startTime <= block.timestamp || config.endTime <= config.startTime) revert InvalidSchedule();
        if (config.endTime - config.startTime > MAX_DURATION) revert InvalidSchedule();
        if (config.maxParticipants == 0) revert InvalidCap();
        if (config.startingCapital != 0 && config.capitalToken == address(0)) revert ZeroAddress();
        if (config.prizePool != 0 && config.prizeToken == address(0)) revert InvalidPrizeToken();
        if (bytes(config.metadataURI).length > MAX_METADATA_LENGTH) revert MetadataTooLong();
        PrizeSplit.validate(config.prizeSplitBps);

        Layout storage $ = _layout();
        // Without a venue nobody proves they own the trading account they register.
        if (!$.approvedVenues[config.venue]) revert VenueNotApproved(config.venue);

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
            $.escrowed[config.prizeToken] += received;
        }
    }

    /// @inheritdoc ITournamentManager
    function setMetadata(uint256 id, string calldata metadataURI) external {
        Tournament storage t = _open(id);
        if (msg.sender != t.organizer) revert NotOrganizer();
        if (block.timestamp >= t.config.endTime) revert TournamentEnded();
        if (bytes(metadataURI).length > MAX_METADATA_LENGTH) revert MetadataTooLong();
        t.config.metadataURI = metadataURI;
        emit MetadataUpdated(id, metadataURI);
    }

    /// @inheritdoc ITournamentManager
    /// @dev A room fills up and the host says go, as in a game show. The duration the host chose is kept, so
    /// the end moves by as much as the start does.
    function startNow(uint256 id) external {
        Tournament storage t = _open(id);
        if (msg.sender != t.organizer) revert NotOrganizer();
        uint64 start = t.config.startTime;
        if (block.timestamp >= start) revert TournamentStarted();
        // A timestamp fits 64 bits for the next 500 billion years.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 now_ = uint64(block.timestamp);
        uint64 end = now_ + (t.config.endTime - start);
        (t.config.startTime, t.config.endTime) = (now_, end);
        emit ScheduleUpdated(id, now_, end);
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
        _layout().escrowed[t.config.prizeToken] -= amount;
        emit RemainderSwept(id, amount);
        IERC20(t.config.prizeToken).safeTransfer(t.organizer, amount);
    }

    /// @inheritdoc ITournamentManager
    /// @dev Only the surplus above what is owed to tournaments can leave, so escrowed prizes are out of reach.
    function rescue(address token, address to)
        external
        nonReentrant
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 amount)
    {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 owed = _layout().escrowed[token];
        // An inequality, not `== 0`: if a misbehaving token ever shrank the balance below what is owed, this
        // reverts cleanly instead of underflowing, and nothing leaves.
        if (balance <= owed) revert NothingToRescue();
        amount = balance - owed;
        emit Rescued(token, to, amount);
        IERC20(token).safeTransfer(to, amount);
    }

    function _refund(uint256 id, Tournament storage t) private {
        uint256 amount = t.unpaid;
        t.unpaid = 0;
        t.status = Status.Cancelled;
        emit TournamentCancelled(id, amount);
        if (amount != 0) {
            _layout().escrowed[t.config.prizeToken] -= amount;
            IERC20(t.config.prizeToken).safeTransfer(t.organizer, amount);
        }
    }
}
