// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../src/TournamentManager.sol";
import {ITournamentManager} from "../src/interfaces/ITournamentManager.sol";
import {FeeOnTransferERC20, MockAccountCore, MockERC20, TournamentManagerV2} from "./mocks/Mocks.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Test} from "forge-std/Test.sol";

contract TournamentManagerTest is Test {
    TournamentManager internal manager;
    MockERC20 internal usdc;
    MockAccountCore internal core;

    address internal admin = makeAddr("admin");
    address internal scorer = makeAddr("scorer");
    address internal organizer = makeAddr("organizer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint64 internal constant DISPUTE_WINDOW = 1 hours;
    uint256 internal constant POOL = 1000e6;
    uint256 internal constant CAPITAL = 5000e6;
    uint64 internal start;
    uint64 internal end;

    function setUp() public {
        usdc = new MockERC20();
        core = new MockAccountCore();
        TournamentManager implementation = new TournamentManager();
        bytes memory init = abi.encodeCall(TournamentManager.initialize, (admin, scorer, address(core), DISPUTE_WINDOW));
        manager = TournamentManager(address(new ERC1967Proxy(address(implementation), init)));

        start = uint64(block.timestamp + 1 hours);
        end = start + 1 days;
        usdc.mint(organizer, 10 * POOL);
        vm.prank(organizer);
        usdc.approve(address(manager), type(uint256).max);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------------------

    function _config() internal view returns (ITournamentManager.Config memory config) {
        uint16[] memory split = new uint16[](3);
        (split[0], split[1], split[2]) = (5000, 3000, 2000);
        config = ITournamentManager.Config({
            prizeToken: address(usdc),
            capitalToken: address(usdc),
            prizePool: POOL,
            startingCapital: CAPITAL,
            startTime: start,
            endTime: end,
            maxParticipants: 100,
            allowlistRoot: bytes32(0),
            prizeSplitBps: split,
            metadataURI: "ipfs://tournament"
        });
    }

    function _create() internal returns (uint256 id) {
        vm.prank(organizer);
        id = manager.createTournament(_config());
    }

    function _tradingAccount(address participant) internal returns (address account) {
        account = makeAddr(string.concat("trading-", vm.toString(participant)));
        core.register(account, participant);
        core.setBalance(account, address(usdc), CAPITAL);
    }

    function _join(uint256 id, address participant) internal returns (address account) {
        account = _tradingAccount(participant);
        vm.prank(participant);
        manager.join(id, account, new bytes32[](0));
    }

    function _post(uint256 id, address[] memory winners) internal {
        vm.warp(end);
        vm.prank(scorer);
        manager.postResults(id, winners);
    }

    function _winners(address a, address b) internal pure returns (address[] memory winners) {
        winners = new address[](2);
        (winners[0], winners[1]) = (a, b);
    }

    function _leaf(address account) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account))));
    }

    // ---------------------------------------------------------------------------------------------------------
    // Initialization and upgrades
    // ---------------------------------------------------------------------------------------------------------

    function test_Initialize_SetsRolesAndConfig() public view {
        assertTrue(manager.hasRole(manager.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(manager.hasRole(manager.UPGRADER_ROLE(), admin));
        assertTrue(manager.hasRole(manager.SCORER_ROLE(), scorer));
        assertEq(manager.accountCore(), address(core));
        assertEq(manager.disputeWindow(), DISPUTE_WINDOW);
    }

    function test_Initialize_RevertsOnSecondCall() public {
        vm.expectRevert();
        manager.initialize(admin, scorer, address(core), DISPUTE_WINDOW);
    }

    function test_Implementation_CannotBeInitialized() public {
        TournamentManager implementation = new TournamentManager();
        vm.expectRevert();
        implementation.initialize(admin, scorer, address(core), DISPUTE_WINDOW);
    }

    function test_Upgrade_KeepsStateAndAddsLogic() public {
        uint256 id = _create();
        _join(id, alice);
        address v2 = address(new TournamentManagerV2());

        vm.prank(admin);
        manager.upgradeToAndCall(v2, "");

        assertEq(TournamentManagerV2(address(manager)).version(), 2);
        assertEq(manager.tournamentCount(), 1);
        assertTrue(manager.tradingAccountOf(id, alice) != address(0));
        (,,,, uint256 unpaid) = manager.getState(id);
        assertEq(unpaid, POOL);
    }

    function test_Upgrade_RevertsForNonUpgrader() public {
        address v2 = address(new TournamentManagerV2());
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, manager.UPGRADER_ROLE()
            )
        );
        vm.prank(alice);
        manager.upgradeToAndCall(v2, "");
    }

    // ---------------------------------------------------------------------------------------------------------
    // createTournament
    // ---------------------------------------------------------------------------------------------------------

    function test_Create_EscrowsPrizePool() public {
        uint256 id = _create();

        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(manager)), POOL);
        (address org, ITournamentManager.Status status,,, uint256 unpaid) = manager.getState(id);
        assertEq(org, organizer);
        assertEq(uint8(status), uint8(ITournamentManager.Status.Open));
        assertEq(unpaid, POOL);
        assertEq(manager.getConfig(id).prizeSplitBps.length, 3);
    }

    function test_Create_AllowsZeroPrizePool() public {
        ITournamentManager.Config memory config = _config();
        config.prizePool = 0;
        config.prizeToken = address(0);
        vm.prank(organizer);
        manager.createTournament(config);
        assertEq(usdc.balanceOf(address(manager)), 0);
    }

    function test_Create_RevertsOnBadSchedule() public {
        ITournamentManager.Config memory config = _config();
        config.startTime = uint64(block.timestamp);
        vm.expectRevert(ITournamentManager.InvalidSchedule.selector);
        vm.prank(organizer);
        manager.createTournament(config);

        config = _config();
        config.endTime = config.startTime;
        vm.expectRevert(ITournamentManager.InvalidSchedule.selector);
        vm.prank(organizer);
        manager.createTournament(config);
    }

    function test_Create_RevertsOnBadSplit() public {
        ITournamentManager.Config memory config = _config();
        config.prizeSplitBps[2] = 1999;
        vm.expectRevert(ITournamentManager.InvalidSplit.selector);
        vm.prank(organizer);
        manager.createTournament(config);

        config.prizeSplitBps = new uint16[](0);
        vm.expectRevert(ITournamentManager.InvalidSplit.selector);
        vm.prank(organizer);
        manager.createTournament(config);
    }

    function test_Create_RevertsOnFeeOnTransferToken() public {
        FeeOnTransferERC20 taxed = new FeeOnTransferERC20();
        taxed.mint(organizer, POOL);
        ITournamentManager.Config memory config = _config();
        config.prizeToken = address(taxed);
        vm.startPrank(organizer);
        taxed.approve(address(manager), POOL);
        vm.expectRevert(
            abi.encodeWithSelector(ITournamentManager.PrizeTransferMismatch.selector, POOL, POOL - POOL / 100)
        );
        manager.createTournament(config);
        vm.stopPrank();
    }

    function test_Create_RevertsWhenPaused() public {
        vm.prank(admin);
        manager.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(organizer);
        manager.createTournament(_config());
    }

    // ---------------------------------------------------------------------------------------------------------
    // join
    // ---------------------------------------------------------------------------------------------------------

    function test_Join_RegistersTradingAccount() public {
        uint256 id = _create();
        address account = _join(id, alice);

        assertEq(manager.tradingAccountOf(id, alice), account);
        (,, uint32 count,,) = manager.getState(id);
        assertEq(count, 1);
    }

    function test_Join_RevertsWhenAccountUnregistered() public {
        uint256 id = _create();
        vm.expectRevert(ITournamentManager.AccountNotRegistered.selector);
        vm.prank(alice);
        manager.join(id, makeAddr("ghost"), new bytes32[](0));
    }

    function test_Join_RevertsWhenAccountOwnedBySomeoneElse() public {
        uint256 id = _create();
        address bobsAccount = _tradingAccount(bob);
        vm.expectRevert(ITournamentManager.NotAccountOwner.selector);
        vm.prank(alice);
        manager.join(id, bobsAccount, new bytes32[](0));
    }

    function test_Join_RevertsOnWrongStartingCapital() public {
        uint256 id = _create();
        address account = _tradingAccount(alice);
        core.setBalance(account, address(usdc), CAPITAL + 1);
        vm.expectRevert(abi.encodeWithSelector(ITournamentManager.WrongStartingCapital.selector, CAPITAL, CAPITAL + 1));
        vm.prank(alice);
        manager.join(id, account, new bytes32[](0));
    }

    function test_Join_RevertsOnDoubleJoinAndReusedAccount() public {
        uint256 id = _create();
        address account = _join(id, alice);

        vm.expectRevert(ITournamentManager.AlreadyJoined.selector);
        vm.prank(alice);
        manager.join(id, account, new bytes32[](0));

        // Same trading account cannot enter twice, even under a different participant.
        core.register(account, bob);
        vm.expectRevert(ITournamentManager.TradingAccountTaken.selector);
        vm.prank(bob);
        manager.join(id, account, new bytes32[](0));
    }

    function test_Join_RevertsWhenFullOrEnded() public {
        ITournamentManager.Config memory config = _config();
        config.maxParticipants = 1;
        vm.prank(organizer);
        uint256 id = manager.createTournament(config);
        _join(id, alice);

        address account = _tradingAccount(bob);
        vm.expectRevert(ITournamentManager.TournamentFull.selector);
        vm.prank(bob);
        manager.join(id, account, new bytes32[](0));

        uint256 second = _create();
        vm.warp(end);
        vm.expectRevert(ITournamentManager.TournamentEnded.selector);
        vm.prank(bob);
        manager.join(second, account, new bytes32[](0));
    }

    function test_Join_EnforcesAllowlist() public {
        (bytes32 a, bytes32 b) = (_leaf(alice), _leaf(bob));
        ITournamentManager.Config memory config = _config();
        config.allowlistRoot = a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
        vm.prank(organizer);
        uint256 id = manager.createTournament(config);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = b;
        address account = _tradingAccount(alice);
        vm.prank(alice);
        manager.join(id, account, proof);

        address carolsAccount = _tradingAccount(carol);
        vm.expectRevert(ITournamentManager.NotAllowlisted.selector);
        vm.prank(carol);
        manager.join(id, carolsAccount, proof);
    }

    function test_Join_SkipsVenueChecksWhenAccountCoreUnset() public {
        vm.prank(admin);
        manager.setAccountCore(address(0));
        uint256 id = _create();
        vm.prank(alice);
        manager.join(id, makeAddr("any"), new bytes32[](0));
        assertEq(manager.tradingAccountOf(id, alice), makeAddr("any"));
    }

    // ---------------------------------------------------------------------------------------------------------
    // Results, disputes and claims
    // ---------------------------------------------------------------------------------------------------------

    function test_PostResults_RevertsBeforeEndOrForNonScorer() public {
        uint256 id = _create();
        _join(id, alice);
        address[] memory winners = _winners(alice, alice);

        vm.expectRevert(ITournamentManager.TournamentNotEnded.selector);
        vm.prank(scorer);
        manager.postResults(id, winners);

        vm.warp(end);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, manager.SCORER_ROLE()
            )
        );
        vm.prank(alice);
        manager.postResults(id, winners);
    }

    function test_PostResults_RevertsOnDuplicateOrOutsider() public {
        uint256 id = _create();
        _join(id, alice);
        vm.warp(end);

        vm.expectRevert(abi.encodeWithSelector(ITournamentManager.DuplicateWinner.selector, alice));
        vm.prank(scorer);
        manager.postResults(id, _winners(alice, alice));

        vm.expectRevert(abi.encodeWithSelector(ITournamentManager.NotParticipant.selector, bob));
        vm.prank(scorer);
        manager.postResults(id, _winners(alice, bob));
    }

    function test_Claim_PaysByRankAfterDisputeWindow() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _post(id, _winners(bob, alice));

        vm.expectRevert(abi.encodeWithSelector(ITournamentManager.DisputeWindowActive.selector, end + DISPUTE_WINDOW));
        vm.prank(bob);
        manager.claim(id);

        vm.warp(end + DISPUTE_WINDOW);
        vm.prank(bob);
        assertEq(manager.claim(id), (POOL * 5000) / 10_000);
        vm.prank(alice);
        assertEq(manager.claim(id), (POOL * 3000) / 10_000);
        assertEq(usdc.balanceOf(bob), 500e6);
        assertEq(usdc.balanceOf(alice), 300e6);

        vm.expectRevert(ITournamentManager.AlreadyClaimed.selector);
        vm.prank(bob);
        manager.claim(id);

        vm.expectRevert(ITournamentManager.NotWinner.selector);
        vm.prank(carol);
        manager.claim(id);
    }

    function test_VoidResults_ReopensForReposting() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _post(id, _winners(bob, alice));

        vm.prank(admin);
        manager.voidResults(id);
        (uint256 amount,) = manager.prizeOf(id, bob);
        assertEq(amount, 0);
        assertEq(manager.getWinners(id).length, 0);

        vm.prank(scorer);
        manager.postResults(id, _winners(alice, bob));
        (amount,) = manager.prizeOf(id, alice);
        assertEq(amount, 500e6);
    }

    function test_VoidResults_RevertsAfterDisputeWindow() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _post(id, _winners(bob, alice));
        vm.warp(end + DISPUTE_WINDOW);

        vm.expectRevert(ITournamentManager.DisputeWindowOver.selector);
        vm.prank(admin);
        manager.voidResults(id);
    }

    function test_DisputeWindowChange_DoesNotMovePendingResults() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _post(id, _winners(bob, alice));

        vm.prank(admin);
        manager.setDisputeWindow(0);

        vm.expectRevert(abi.encodeWithSelector(ITournamentManager.DisputeWindowActive.selector, end + DISPUTE_WINDOW));
        vm.prank(bob);
        manager.claim(id);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Funds never get stuck
    // ---------------------------------------------------------------------------------------------------------

    function test_Sweep_ReturnsUnfilledRanksToOrganizer() public {
        uint256 id = _create();
        _join(id, alice);
        _join(id, bob);
        _post(id, _winners(bob, alice));
        vm.warp(end + DISPUTE_WINDOW);
        uint256 before = usdc.balanceOf(organizer);

        assertEq(manager.sweep(id), 200e6); // third rank has no winner
        assertEq(usdc.balanceOf(organizer), before + 200e6);

        vm.expectRevert(ITournamentManager.NothingToSweep.selector);
        manager.sweep(id);

        // Winners are still fully covered after the sweep.
        vm.prank(bob);
        manager.claim(id);
        vm.prank(alice);
        manager.claim(id);
        assertEq(usdc.balanceOf(address(manager)), 0);
    }

    function test_Cancel_RefundsOrganizerBeforeStart() public {
        uint256 id = _create();
        uint256 before = usdc.balanceOf(organizer);
        vm.prank(organizer);
        manager.cancel(id);

        assertEq(usdc.balanceOf(organizer), before + POOL);
        (, ITournamentManager.Status status,,,) = manager.getState(id);
        assertEq(uint8(status), uint8(ITournamentManager.Status.Cancelled));
    }

    function test_Cancel_OnlyAdminAfterStart() public {
        uint256 id = _create();
        vm.warp(start);

        vm.expectRevert(ITournamentManager.TournamentStarted.selector);
        vm.prank(organizer);
        manager.cancel(id);

        vm.expectRevert(ITournamentManager.NotOrganizer.selector);
        vm.prank(alice);
        manager.cancel(id);

        vm.prank(admin);
        manager.cancel(id);
        assertEq(usdc.balanceOf(address(manager)), 0);
    }

    function test_Reclaim_AfterGraceWhenNeverScored() public {
        uint256 id = _create();
        uint64 reclaimableAt = end + manager.RESULTS_GRACE();

        vm.warp(reclaimableAt - 1);
        vm.expectRevert(abi.encodeWithSelector(ITournamentManager.GracePeriodActive.selector, reclaimableAt));
        vm.prank(organizer);
        manager.reclaim(id);

        vm.warp(reclaimableAt);
        vm.prank(organizer);
        manager.reclaim(id);
        assertEq(usdc.balanceOf(address(manager)), 0);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------------------------------------------

    /// @dev For any pool size and two-way split, claims plus sweep return exactly the pool and leave no dust.
    function testFuzz_PayoutsConserveThePool(uint256 pool, uint16 firstBps) public {
        pool = bound(pool, 1, 1e30);
        firstBps = uint16(bound(firstBps, 1, 9999));
        usdc.mint(organizer, pool);

        ITournamentManager.Config memory config = _config();
        config.prizePool = pool;
        config.prizeSplitBps = new uint16[](2);
        (config.prizeSplitBps[0], config.prizeSplitBps[1]) = (firstBps, 10_000 - firstBps);
        vm.prank(organizer);
        uint256 id = manager.createTournament(config);
        _join(id, alice);
        _join(id, bob);
        _post(id, _winners(alice, bob));
        vm.warp(end + DISPUTE_WINDOW);

        uint256 organizerBefore = usdc.balanceOf(organizer);
        vm.prank(alice);
        uint256 first = manager.claim(id);
        vm.prank(bob);
        uint256 second = manager.claim(id);
        uint256 dust = pool - first - second;
        if (dust != 0) assertEq(manager.sweep(id), dust);

        assertEq(first + second + (usdc.balanceOf(organizer) - organizerBefore), pool);
        assertEq(usdc.balanceOf(address(manager)), 0);
    }
}
