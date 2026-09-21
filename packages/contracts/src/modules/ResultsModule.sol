// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentBase} from "../TournamentBase.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ResultsModule
/// @notice Scoring outcome and payouts: post, dispute, claim.
/// @dev Scores are computed offchain from the venue's public data. They only become claimable after a dispute
/// window during which the admin can void them. Claims are never pausable: a winner can always exit.
abstract contract ResultsModule is TournamentBase {
    using SafeERC20 for IERC20;

    /// @inheritdoc ITournamentManager
    /// @param winners Participants ranked best first. May be shorter than the prize split.
    function postResults(uint256 id, address[] calldata winners) external whenNotPaused onlyRole(SCORER_ROLE) {
        Tournament storage t = _open(id);
        if (block.timestamp < t.config.endTime) revert TournamentNotEnded();
        if (winners.length > t.config.prizeSplitBps.length) revert TooManyWinners();

        for (uint256 i; i < winners.length; ++i) {
            address winner = winners[i];
            // Input validation over at most MAX_WINNERS entries; reverting on the first bad one is intended.
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (t.tradingAccountOf[winner] == address(0)) revert NotParticipant(winner);
            // forge-lint: disable-next-line(require-revert-in-loop)
            if (t.rankOf[winner] != 0) revert DuplicateWinner(winner);
            t.rankOf[winner] = i + 1;
        }

        t.winners = winners;
        t.status = Status.ResultsPosted;
        // Fixed at posting time so later changes to the window never move a pending tournament.
        // A uint64 timestamp cannot truncate for roughly 5e11 years.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 claimableAt = uint64(block.timestamp) + _layout().disputeWindow;
        t.claimableAt = claimableAt;

        emit ResultsPosted(id, winners, claimableAt);
    }

    /// @inheritdoc ITournamentManager
    /// @dev Only possible while no prize can have been claimed yet.
    function voidResults(uint256 id) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Tournament storage t = _layout().tournaments[id];
        if (t.status != Status.ResultsPosted) revert WrongStatus(t.status);
        if (block.timestamp >= t.claimableAt) revert DisputeWindowOver();

        uint256 length = t.winners.length;
        for (uint256 i; i < length; ++i) {
            delete t.rankOf[t.winners[i]];
        }
        delete t.winners;
        t.status = Status.Open;
        t.claimableAt = 0;

        emit ResultsVoided(id);
    }

    /// @inheritdoc ITournamentManager
    function claim(uint256 id) external nonReentrant returns (uint256 amount) {
        Tournament storage t = _claimable(id);
        uint256 rankPlusOne = t.rankOf[msg.sender];
        if (rankPlusOne == 0) revert NotWinner();
        if (t.claimed[msg.sender]) revert AlreadyClaimed();

        t.claimed[msg.sender] = true;
        amount = _prize(t, rankPlusOne - 1);
        t.unpaid -= amount;

        emit PrizeClaimed(id, msg.sender, rankPlusOne, amount);
        if (amount != 0) {
            _layout().escrowed[t.config.prizeToken] -= amount;
            IERC20(t.config.prizeToken).safeTransfer(msg.sender, amount);
        }
    }
}
