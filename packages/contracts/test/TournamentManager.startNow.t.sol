// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ITournamentManager} from "../src/interfaces/ITournamentManager.sol";
import {TournamentManagerTest} from "./TournamentManager.t.sol";

/// @notice The host says go: the tournament starts now and keeps its duration.
contract TournamentManagerStartNowTest is TournamentManagerTest {
    function test_StartNow_MovesTheWindowAndKeepsTheDuration() public {
        uint256 id = _create();
        vm.warp(start - 10 minutes);
        uint64 now_ = uint64(vm.getBlockTimestamp());
        vm.expectEmit();
        emit ITournamentManager.ScheduleUpdated(id, now_, now_ + (end - start));
        vm.prank(organizer);
        manager.startNow(id);
        ITournamentManager.Config memory config = manager.getConfig(id);
        assertEq(config.startTime, now_);
        assertEq(config.endTime, now_ + (end - start));
    }

    function test_StartNow_OnlyTheOrganizerBeforeTheStart() public {
        uint256 id = _create();
        uint256 cancelled = _create();
        vm.prank(organizer);
        manager.cancel(cancelled);

        vm.expectRevert(ITournamentManager.NotOrganizer.selector);
        vm.prank(alice);
        manager.startNow(id);

        vm.warp(start);
        vm.expectRevert(ITournamentManager.TournamentStarted.selector);
        vm.prank(organizer);
        manager.startNow(id);

        vm.expectRevert(
            abi.encodeWithSelector(ITournamentManager.WrongStatus.selector, ITournamentManager.Status.Cancelled)
        );
        vm.prank(organizer);
        manager.startNow(cancelled);
    }
}
