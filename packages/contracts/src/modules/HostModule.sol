// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentBase} from "../TournamentBase.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";

/// @title HostModule
/// @notice What an organizer can change about their own tournament after creating it: its name and logo, when
/// it starts, and who may enter by invite. Money moves in `EscrowModule`, never here.
abstract contract HostModule is TournamentBase {
    /// @inheritdoc ITournamentManager
    function setMetadata(uint256 id, string calldata metadataURI) external {
        Tournament storage t = _hosted(id);
        if (block.timestamp >= t.config.endTime) revert TournamentEnded();
        if (bytes(metadataURI).length > MAX_METADATA_LENGTH) revert MetadataTooLong();
        t.config.metadataURI = metadataURI;
        emit MetadataUpdated(id, metadataURI);
    }

    /// @inheritdoc ITournamentManager
    /// @dev A room fills up and the host says go, as in a game show. The duration the host chose is kept, so
    /// the end moves by as much as the start does.
    function startNow(uint256 id) external {
        Tournament storage t = _hosted(id);
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
    function setInvite(uint256 id, address signer) external {
        Tournament storage t = _hosted(id);
        if (block.timestamp >= t.config.endTime) revert TournamentEnded();
        _layout().inviteSigners[id] = signer;
        emit InviteUpdated(id, signer);
    }
}
