// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../../src/TournamentManager.sol";
import {IAccountCore} from "../../src/interfaces/IAccountCore.sol";
import {ITournamentManager} from "../../src/interfaces/ITournamentManager.sol";
import {KuruVenueAdapter} from "../../src/venues/KuruVenueAdapter.sol";
import {MockAccountCore, MockERC20} from "../mocks/Mocks.sol";
import {Handler} from "./Handler.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test, console2} from "forge-std/Test.sol";

contract TournamentManagerInvariantTest is Test {
    TournamentManager internal manager;
    MockERC20 internal usdc;
    Handler internal handler;

    function setUp() public {
        address admin = makeAddr("admin");
        address scorer = makeAddr("scorer");
        usdc = new MockERC20();
        MockAccountCore core = new MockAccountCore();
        bytes memory init = abi.encodeCall(TournamentManager.initialize, (admin, scorer, 1 hours, 0));
        manager = TournamentManager(address(new ERC1967Proxy(address(new TournamentManager()), init)));
        address venue = address(new KuruVenueAdapter(IAccountCore(address(core))));
        vm.prank(admin);
        manager.setVenueApproval(venue, true);

        handler = new Handler(manager, usdc, core, venue, admin, scorer);
        targetContract(address(handler));
    }

    /// @dev The escrow counter is exactly what tournaments are still owed, and the balance always covers it.
    /// Anything above it is a stray donation, the only thing `rescue` can take.
    function invariant_EscrowIsSolventAndExact() public view {
        uint256 owed;
        for (uint256 i; i < handler.idCount(); ++i) {
            (,,,, uint256 unpaid) = manager.getState(handler.ids(i));
            owed += unpaid;
        }
        assertEq(manager.escrowed(address(usdc)), owed);
        assertGe(usdc.balanceOf(address(manager)), owed);
        assertEq(usdc.balanceOf(address(manager)) - owed, handler.donated() - handler.rescued());
    }

    /// @dev Every escrowed token is either still held, claimed by a winner, or back with an organizer.
    function invariant_FundsAreConserved() public view {
        assertEq(
            handler.escrowed() + handler.donated(),
            handler.claimed() + handler.swept() + handler.refunded() + handler.rescued()
                + usdc.balanceOf(address(manager))
        );
    }

    function invariant_PerTournamentBounds() public view {
        for (uint256 i; i < handler.idCount(); ++i) {
            uint256 id = handler.ids(i);
            ITournamentManager.Config memory config = manager.getConfig(id);
            (, ITournamentManager.Status status, uint32 participants,, uint256 unpaid) = manager.getState(id);

            assertLe(unpaid, config.prizePool);
            assertLe(participants, config.maxParticipants);
            assertLe(manager.getWinners(id).length, config.prizeSplitBps.length);
            if (status == ITournamentManager.Status.Cancelled) assertEq(unpaid, 0);
        }
    }

    /// @dev Printed with -vv. Confirms that runs reach the payout paths instead of idling in `create`.
    function afterInvariant() public view {
        console2.log("tournaments", handler.idCount());
        console2.log("escrowed", handler.escrowed());
        console2.log("claimed", handler.claimed());
        console2.log("swept", handler.swept());
        console2.log("refunded", handler.refunded());
        console2.log("donated", handler.donated());
        console2.log("rescued", handler.rescued());
    }
}
