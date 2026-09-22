// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ITournamentManager} from "../src/interfaces/ITournamentManager.sol";
import {TournamentManagerTest} from "./TournamentManager.t.sol";

/// @notice The organizer can rename or rebrand while the tournament is open and not yet over.
contract TournamentManagerMetadataTest is TournamentManagerTest {
    string internal constant NEW_URI = "data:application/json,%7B%22name%22%3A%22Renamed%22%7D";

    function test_SetMetadata_ReplacesTheUri() public {
        uint256 id = _create();
        vm.expectEmit();
        emit ITournamentManager.MetadataUpdated(id, NEW_URI);
        vm.prank(organizer);
        manager.setMetadata(id, NEW_URI);
        assertEq(manager.getConfig(id).metadataURI, NEW_URI);
    }

    function test_SetMetadata_OnlyOrganizer() public {
        uint256 id = _create();
        vm.expectRevert(ITournamentManager.NotOrganizer.selector);
        vm.prank(alice);
        manager.setMetadata(id, NEW_URI);
    }

    function test_SetMetadata_RejectsTooLong() public {
        uint256 id = _create();
        string memory tooLong = new string(manager.MAX_METADATA_LENGTH() + 1);
        vm.expectRevert(ITournamentManager.MetadataTooLong.selector);
        vm.prank(organizer);
        manager.setMetadata(id, tooLong);
    }

    function test_SetMetadata_NotAfterTheEndOrOnceClosed() public {
        uint256 cancelled = _create();
        vm.prank(organizer);
        manager.cancel(cancelled);

        uint256 id = _create();
        vm.warp(end);
        vm.expectRevert(ITournamentManager.TournamentEnded.selector);
        vm.prank(organizer);
        manager.setMetadata(id, NEW_URI);

        vm.expectRevert(
            abi.encodeWithSelector(ITournamentManager.WrongStatus.selector, ITournamentManager.Status.Cancelled)
        );
        vm.prank(organizer);
        manager.setMetadata(cancelled, NEW_URI);
    }
}
