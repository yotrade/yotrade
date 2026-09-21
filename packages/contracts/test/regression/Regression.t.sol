// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../../src/TournamentManager.sol";
import {ITournamentManager} from "../../src/interfaces/ITournamentManager.sol";
import {MockAccountCore, MockERC20} from "../mocks/Mocks.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test, Vm} from "forge-std/Test.sol";

/// @notice One test per defect that was found and fixed. Names carry the issue number.
contract RegressionTest is Test {
    TournamentManager internal manager;
    MockERC20 internal usdc;
    MockAccountCore internal core;

    address internal admin = makeAddr("admin");
    address internal scorer = makeAddr("scorer");
    address internal organizer = makeAddr("organizer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal griefer = makeAddr("griefer");

    uint256 internal constant POOL = 1000e6;
    uint256 internal constant CAPITAL = 5000e6;
    uint64 internal start;
    uint64 internal end;

    function setUp() public {
        usdc = new MockERC20();
        core = new MockAccountCore();
        bytes memory init = abi.encodeCall(TournamentManager.initialize, (admin, scorer, address(core), 1 hours));
        manager = TournamentManager(address(new ERC1967Proxy(address(new TournamentManager()), init)));
        start = uint64(block.timestamp + 1 hours);
        end = start + 1 days;
        usdc.mint(organizer, POOL);
        vm.prank(organizer);
        usdc.approve(address(manager), POOL);
    }

    function _config() internal view returns (ITournamentManager.Config memory config) {
        uint16[] memory split = new uint16[](2);
        (split[0], split[1]) = (7000, 3000);
        config = ITournamentManager.Config(
            address(usdc), address(usdc), POOL, CAPITAL, start, end, 10, bytes32(0), split, "ipfs://t"
        );
    }

    /// @dev #7: `AccountCore.depositForAccount` is permissionless. With an exact-balance check a griefer could send
    /// one unit to the victim's trading account and block `join` forever.
    function test_Regression_7_DustDepositCannotBlockJoin() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());
        address account = makeAddr("alice-trading");
        core.register(account, alice);
        core.setBalance(account, address(usdc), CAPITAL);

        vm.prank(griefer);
        core.depositForAccount(account, address(usdc), 1);

        vm.prank(alice);
        manager.join(id, account, new bytes32[](0));
        assertEq(manager.capitalAtJoin(id, alice), CAPITAL + 1, "scorer must see the real denominator");
    }

    /// @dev #7: a tournament scheduled with millisecond timestamps would run for tens of thousands of years.
    function test_Regression_7_MillisecondTimestampsRejected() public {
        ITournamentManager.Config memory config = _config();
        config.startTime = uint64((block.timestamp + 1 hours) * 1000);
        config.endTime = uint64((block.timestamp + 25 hours) * 1000);
        vm.expectRevert(ITournamentManager.InvalidSchedule.selector);
        vm.prank(organizer);
        manager.createTournament(config);
    }

    /// @dev #5 (pre-merge review): the dispute window was read at claim time, so shortening it would have released
    /// prizes for results that were still inside their original window.
    function test_Regression_5_PendingResultsKeepTheirDisputeWindow() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());
        address account = makeAddr("alice-trading");
        core.register(account, alice);
        core.setBalance(account, address(usdc), CAPITAL);
        vm.prank(alice);
        manager.join(id, account, new bytes32[](0));

        vm.warp(end);
        address[] memory winners = new address[](1);
        winners[0] = alice;
        vm.prank(scorer);
        manager.postResults(id, winners);
        vm.prank(admin);
        manager.setDisputeWindow(0);

        vm.expectRevert(abi.encodeWithSelector(ITournamentManager.DisputeWindowActive.selector, end + 1 hours));
        vm.prank(alice);
        manager.claim(id);
    }

    /// @dev #11: lifecycle events were emitted after the token transfer, so a prize token with callbacks could
    /// interleave its own logs between our state change and our event.
    function test_Regression_11_EventsPrecedeTokenTransfers() public {
        vm.prank(organizer);
        uint256 id = manager.createTournament(_config());
        address account = makeAddr("alice-trading");
        core.register(account, alice);
        core.setBalance(account, address(usdc), CAPITAL);
        vm.prank(alice);
        manager.join(id, account, new bytes32[](0));

        vm.warp(end);
        address[] memory winners = new address[](1);
        winners[0] = alice;
        vm.prank(scorer);
        manager.postResults(id, winners);
        vm.warp(end + 1 hours);

        vm.recordLogs();
        vm.prank(alice);
        manager.claim(id);
        _assertManagerLogsFirst(ITournamentManager.PrizeClaimed.selector);

        vm.recordLogs();
        manager.sweep(id);
        _assertManagerLogsFirst(ITournamentManager.RemainderSwept.selector);
    }

    function _assertManagerLogsFirst(bytes32 expectedTopic) internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2, "one lifecycle event and one ERC-20 Transfer");
        assertEq(logs[0].emitter, address(manager));
        assertEq(logs[0].topics[0], expectedTopic);
        assertEq(logs[1].emitter, address(usdc));
    }
}
