// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../../src/TournamentManager.sol";
import {IAccountCore} from "../../src/interfaces/IAccountCore.sol";
import {ITournamentManager} from "../../src/interfaces/ITournamentManager.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test} from "forge-std/Test.sol";

interface IAccountCoreExtra is IAccountCore {
    function userAddressById(uint40 id) external view returns (address);
}

/// @notice Runs `join` against the live Kuru Spot V2 AccountCore on Monad testnet, so an interface drift is caught
/// before users hit it. Skipped unless MONAD_TESTNET_RPC_URL is set.
contract KuruAccountCoreForkTest is Test {
    IAccountCoreExtra internal constant CORE = IAccountCoreExtra(0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22);
    address internal constant USDC = 0xEe0722ead54f1B4fe97bE399Be43BC0226a6f97E;

    TournamentManager internal manager;
    address internal trader;

    function setUp() public {
        string memory rpc = vm.envOr("MONAD_TESTNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        vm.createSelectFork(rpc);

        bytes memory init =
            abi.encodeCall(TournamentManager.initialize, (address(this), address(this), address(CORE), 0));
        manager = TournamentManager(address(new ERC1967Proxy(address(new TournamentManager()), init)));
        trader = CORE.userAddressById(1);
    }

    function _create(uint256 startingCapital) internal returns (uint256) {
        uint16[] memory split = new uint16[](1);
        split[0] = 10_000;
        return manager.createTournament(
            ITournamentManager.Config({
                prizeToken: address(0),
                capitalToken: USDC,
                prizePool: 0,
                startingCapital: startingCapital,
                startTime: uint64(block.timestamp + 1),
                endTime: uint64(block.timestamp + 1 days),
                maxParticipants: 10,
                allowlistRoot: bytes32(0),
                prizeSplitBps: split,
                metadataURI: ""
            })
        );
    }

    function testFork_LiveAccountMatchesInterface() public view {
        assertEq(CORE.userRegistry(trader), 1);
        assertEq(CORE.getAccountOwner(trader), trader, "a root account owns itself");
    }

    function testFork_JoinWithLiveRootAccount() public {
        uint256 balance = CORE.getBalance(trader, USDC);
        uint256 id = _create(balance);

        vm.prank(trader);
        manager.join(id, trader, new bytes32[](0));

        assertEq(manager.tradingAccountOf(id, trader), trader);
        assertEq(manager.capitalAtJoin(id, trader), balance);
    }

    function testFork_JoinRejectsForeignAndUnknownAccounts() public {
        uint256 id = _create(0);

        vm.expectRevert(ITournamentManager.NotAccountOwner.selector);
        vm.prank(makeAddr("stranger"));
        manager.join(id, trader, new bytes32[](0));

        vm.expectRevert(ITournamentManager.AccountNotRegistered.selector);
        vm.prank(makeAddr("stranger"));
        manager.join(id, makeAddr("never-registered"), new bytes32[](0));
    }

    function testFork_JoinRejectsUnderfundedAccount() public {
        uint256 balance = CORE.getBalance(trader, USDC);
        uint256 id = _create(balance + 1);

        vm.expectRevert(
            abi.encodeWithSelector(ITournamentManager.InsufficientStartingCapital.selector, balance + 1, balance)
        );
        vm.prank(trader);
        manager.join(id, trader, new bytes32[](0));
    }
}
