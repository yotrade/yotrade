// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentBase} from "../TournamentBase.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AdminModule
/// @notice The platform's own switches: which venues are trusted, how long results can be disputed, the pause,
/// and returning tokens sent here by mistake. None of it can touch an escrowed prize.
abstract contract AdminModule is TournamentBase {
    using SafeERC20 for IERC20;

    /// @notice Longest review window results can be given before prizes unlock.
    uint64 public constant MAX_DISPUTE_WINDOW = 7 days;

    /// @notice Approves or revokes a venue adapter. Revoking does not affect tournaments already created.
    function setVenueApproval(address venue, bool approved) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (venue == address(0)) revert ZeroAddress();
        _layout().approvedVenues[venue] = approved;
        emit VenueApprovalUpdated(venue, approved);
    }

    function setDisputeWindow(uint64 disputeWindow_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDisputeWindow(disputeWindow_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
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

    function _setDisputeWindow(uint64 disputeWindow_) internal {
        if (disputeWindow_ > MAX_DISPUTE_WINDOW) revert InvalidSchedule();
        _layout().disputeWindow = disputeWindow_;
        emit DisputeWindowUpdated(disputeWindow_);
    }
}
