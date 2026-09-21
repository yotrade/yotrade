// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../src/TournamentManager.sol";
import {IAccountCore} from "../src/interfaces/IAccountCore.sol";
import {ITournamentManager} from "../src/interfaces/ITournamentManager.sol";
import {KuruVenueAdapter} from "../src/venues/KuruVenueAdapter.sol";
import {MockAccountCore, MockERC20} from "./mocks/Mocks.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Input validation and access control: every guard has a test that trips it.
contract TournamentManagerGuardsTest is Test {
    TournamentManager internal manager;
    MockERC20 internal usdc;
    MockAccountCore internal core;
    KuruVenueAdapter internal venue;

    address internal admin = makeAddr("admin");
    address internal scorer = makeAddr("scorer");
    address internal organizer = makeAddr("organizer");
    address internal alice = makeAddr("alice");

    function setUp() public {
        usdc = new MockERC20();
        core = new MockAccountCore();
        bytes memory init = abi.encodeCall(TournamentManager.initialize, (admin, scorer, 1 hours, 1 days));
        manager = TournamentManager(address(new ERC1967Proxy(address(new TournamentManager()), init)));
        venue = new KuruVenueAdapter(IAccountCore(address(core)));
        vm.prank(admin);
        manager.setVenueApproval(address(venue), true);
    }

    function _config() internal view returns (ITournamentManager.Config memory config) {
        uint16[] memory split = new uint16[](1);
        split[0] = 10_000;
        config = ITournamentManager.Config({
            prizeToken: address(0),
            capitalToken: address(usdc),
            venue: address(venue),
            prizePool: 0,
            startingCapital: 0,
            startTime: uint64(vm.getBlockTimestamp() + 1 hours),
            endTime: uint64(vm.getBlockTimestamp() + 2 hours),
            maxParticipants: 10,
            allowlistRoot: bytes32(0),
            prizeSplitBps: split,
            metadataURI: ""
        });
    }

    function _expectCreateRevert(ITournamentManager.Config memory config, bytes4 selector) internal {
        vm.expectRevert(selector);
        vm.prank(organizer);
        manager.createTournament(config);
    }

    function test_Initialize_RevertsOnZeroAdminOrScorer() public {
        address implementation = address(new TournamentManager());
        vm.expectRevert(ITournamentManager.ZeroAddress.selector);
        new ERC1967Proxy(implementation, abi.encodeCall(TournamentManager.initialize, (address(0), scorer, 0, 0)));
        vm.expectRevert(ITournamentManager.ZeroAddress.selector);
        new ERC1967Proxy(implementation, abi.encodeCall(TournamentManager.initialize, (admin, address(0), 0, 0)));
    }

    function test_Create_RevertsOnZeroCap() public {
        ITournamentManager.Config memory config = _config();
        config.maxParticipants = 0;
        _expectCreateRevert(config, ITournamentManager.InvalidCap.selector);
    }

    function test_Create_RevertsOnCapitalWithoutToken() public {
        ITournamentManager.Config memory config = _config();
        config.startingCapital = 1;
        config.capitalToken = address(0);
        _expectCreateRevert(config, ITournamentManager.ZeroAddress.selector);
    }

    function test_Create_RevertsOnPoolWithoutToken() public {
        ITournamentManager.Config memory config = _config();
        config.prizePool = 1;
        _expectCreateRevert(config, ITournamentManager.InvalidPrizeToken.selector);
    }

    function test_Create_RevertsOnZeroShareOrTooManyRanks() public {
        ITournamentManager.Config memory config = _config();
        config.prizeSplitBps = new uint16[](2);
        (config.prizeSplitBps[0], config.prizeSplitBps[1]) = (10_000, 0);
        _expectCreateRevert(config, ITournamentManager.InvalidSplit.selector);

        config.prizeSplitBps = new uint16[](manager.MAX_WINNERS() + 1);
        _expectCreateRevert(config, ITournamentManager.InvalidSplit.selector);
    }

    function test_Create_RevertsOverMaxDuration() public {
        ITournamentManager.Config memory config = _config();
        config.endTime = config.startTime + manager.MAX_DURATION() + 1;
        _expectCreateRevert(config, ITournamentManager.InvalidSchedule.selector);
    }

    function test_Join_RevertsOnZeroAccountPausedOrClosed() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());

        vm.expectRevert(ITournamentManager.ZeroAddress.selector);
        vm.prank(alice);
        manager.join(id, address(0), new bytes32[](0));

        vm.prank(admin);
        manager.pause();
        core.register(alice, alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        manager.join(id, alice, new bytes32[](0));

        vm.startPrank(admin);
        manager.unpause();
        manager.cancel(id);
        vm.stopPrank();
        vm.expectRevert(
            abi.encodeWithSelector(ITournamentManager.WrongStatus.selector, ITournamentManager.Status.Cancelled)
        );
        vm.prank(alice);
        manager.join(id, alice, new bytes32[](0));
    }

    function test_Join_WithoutCapitalRequirementStillChecksOwnership() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());
        address account = makeAddr("alice-trading");
        core.register(account, alice);

        vm.prank(alice);
        manager.join(id, account, new bytes32[](0));
        assertEq(manager.capitalAtJoin(id, alice), 0);
    }

    function test_Join_RevertsOnUnknownTournament() public {
        vm.expectRevert(abi.encodeWithSelector(ITournamentManager.WrongStatus.selector, ITournamentManager.Status.None));
        vm.prank(alice);
        manager.join(42, alice, new bytes32[](0));
    }

    function test_PostResults_RevertsOnTooManyWinners() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());
        vm.warp(vm.getBlockTimestamp() + 2 hours);

        vm.expectRevert(ITournamentManager.TooManyWinners.selector);
        vm.prank(scorer);
        manager.postResults(id, new address[](2));
    }

    function test_Reclaim_RevertsForNonOrganizer() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());
        vm.expectRevert(ITournamentManager.NotOrganizer.selector);
        vm.prank(alice);
        manager.reclaim(id);
    }

    function test_Claim_ZeroPoolStillRecordsTheWin() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());
        core.register(alice, alice);
        vm.prank(alice);
        manager.join(id, alice, new bytes32[](0));

        vm.warp(vm.getBlockTimestamp() + 2 hours);
        address[] memory winners = new address[](1);
        winners[0] = alice;
        vm.prank(scorer);
        manager.postResults(id, winners);
        vm.warp(vm.getBlockTimestamp() + 1 hours);

        vm.prank(alice);
        assertEq(manager.claim(id), 0);
        (, bool claimed) = manager.prizeOf(id, alice);
        assertTrue(claimed);
    }

    function test_AdminSetters_AreRestrictedAndBounded() public {
        bytes memory unauthorized = abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, alice, manager.DEFAULT_ADMIN_ROLE()
        );
        vm.startPrank(alice);
        vm.expectRevert(unauthorized);
        manager.setVenueApproval(address(1), true);
        vm.expectRevert(unauthorized);
        manager.rescue(address(usdc), alice);
        vm.expectRevert(unauthorized);
        manager.setDisputeWindow(1);
        vm.expectRevert(unauthorized);
        manager.voidResults(1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, manager.PAUSER_ROLE()
            )
        );
        manager.pause();
        vm.stopPrank();

        uint64 tooLong = manager.MAX_DISPUTE_WINDOW() + 1;
        vm.expectRevert(ITournamentManager.InvalidSchedule.selector);
        vm.prank(admin);
        manager.setDisputeWindow(tooLong);
    }

    function test_SetVenueApproval_RejectsZeroAddress() public {
        vm.expectRevert(ITournamentManager.ZeroAddress.selector);
        vm.prank(admin);
        manager.setVenueApproval(address(0), true);
    }

    function test_KuruVenueAdapter_RejectsZeroAccountCore() public {
        vm.expectRevert(KuruVenueAdapter.ZeroAddress.selector);
        new KuruVenueAdapter(IAccountCore(address(0)));
    }

    function test_Create_RevertsOnOversizedMetadata() public {
        ITournamentManager.Config memory config = _config();
        config.metadataURI = string(new bytes(manager.MAX_METADATA_LENGTH() + 1));
        _expectCreateRevert(config, ITournamentManager.MetadataTooLong.selector);
    }

    function test_PostResults_RevertsWhenPaused() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());
        vm.warp(vm.getBlockTimestamp() + 2 hours);
        vm.prank(admin);
        manager.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(scorer);
        manager.postResults(id, new address[](0));
    }

    // ---------------------------------------------------------------------------------------------------------
    // Rescue: only the surplus can ever leave
    // ---------------------------------------------------------------------------------------------------------

    function test_Rescue_ReturnsStrayTokensButNeverEscrowedPrizes() public {
        ITournamentManager.Config memory config = _config();
        (config.prizeToken, config.prizePool) = (address(usdc), 1000e6);
        usdc.mint(organizer, 1000e6);
        vm.startPrank(organizer);
        usdc.approve(address(manager), 1000e6);
        manager.createTournament(config);
        vm.stopPrank();
        usdc.mint(address(manager), 25e6); // someone sent tokens by mistake

        vm.prank(admin);
        assertEq(manager.rescue(address(usdc), alice), 25e6);
        assertEq(usdc.balanceOf(alice), 25e6);
        assertEq(usdc.balanceOf(address(manager)), manager.escrowed(address(usdc)));

        vm.expectRevert(ITournamentManager.NothingToRescue.selector);
        vm.prank(admin);
        manager.rescue(address(usdc), alice);
    }

    function test_Rescue_RejectsZeroAddresses() public {
        vm.startPrank(admin);
        vm.expectRevert(ITournamentManager.ZeroAddress.selector);
        manager.rescue(address(0), alice);
        vm.expectRevert(ITournamentManager.ZeroAddress.selector);
        manager.rescue(address(usdc), address(0));
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------------------------------------------
    // Default admin: two steps and a delay
    // ---------------------------------------------------------------------------------------------------------

    function test_DefaultAdmin_TransferNeedsAcceptanceAfterTheDelay() public {
        address next = makeAddr("next-admin");
        vm.prank(admin);
        manager.beginDefaultAdminTransfer(next);
        assertEq(manager.defaultAdmin(), admin, "nothing changes until the new admin accepts");

        vm.expectRevert();
        vm.prank(next);
        manager.acceptDefaultAdminTransfer();

        vm.warp(vm.getBlockTimestamp() + 1 days + 1);
        vm.prank(next);
        manager.acceptDefaultAdminTransfer();
        assertEq(manager.defaultAdmin(), next);
        assertFalse(manager.hasRole(manager.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_DefaultAdmin_CannotBeGrantedToASecondAccount() public {
        bytes32 role = manager.DEFAULT_ADMIN_ROLE();
        vm.expectRevert();
        vm.prank(admin);
        manager.grantRole(role, alice);
    }
}
