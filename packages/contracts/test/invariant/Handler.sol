// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../../src/TournamentManager.sol";
import {ITournamentManager} from "../../src/interfaces/ITournamentManager.sol";
import {MockAccountCore, MockERC20} from "../mocks/Mocks.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Drives TournamentManager through random but valid-looking sequences and tracks where every token went.
contract Handler is Test {
    TournamentManager public immutable manager;
    MockERC20 public immutable usdc;
    MockAccountCore public immutable core;
    address public immutable venue;
    address public immutable admin;
    address public immutable scorer;

    uint256 internal constant CAPITAL = 1000e6;
    /// @dev Few tournaments, many interactions each: otherwise calls spread too thin to ever reach a claim.
    uint256 internal constant MAX_TOURNAMENTS = 3;
    address[] public actors;
    uint256[] public ids;
    mapping(uint256 id => address[] joined) internal _joined;

    // Ghost accounting
    uint256 public escrowed;
    uint256 public claimed;
    uint256 public swept;
    uint256 public refunded;
    uint256 public donated;
    uint256 public rescued;

    constructor(
        TournamentManager manager_,
        MockERC20 usdc_,
        MockAccountCore core_,
        address venue_,
        address admin_,
        address scorer_
    ) {
        (manager, usdc, core, venue, admin, scorer) = (manager_, usdc_, core_, venue_, admin_, scorer_);
        for (uint256 i; i < 6; ++i) {
            actors.push(makeAddr(string.concat("actor-", vm.toString(i))));
        }
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    // ---------------------------------------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------------------------------------

    function create(uint256 actorSeed, uint256 pool, uint256 winnerSlots, uint256 duration, uint32 cap) external {
        if (ids.length == MAX_TOURNAMENTS) return;
        address organizer = _actor(actorSeed);
        pool = bound(pool, 0, 1e15);
        winnerSlots = bound(winnerSlots, 1, 4);
        uint64 start = uint64(block.timestamp + 1);

        uint16[] memory split = new uint16[](winnerSlots);
        uint16 share = uint16(10_000 / winnerSlots);
        for (uint256 i; i < winnerSlots; ++i) {
            split[i] = share;
        }
        split[0] += uint16(10_000 - share * winnerSlots);

        ITournamentManager.Config memory config = ITournamentManager.Config({
            prizeToken: address(usdc),
            capitalToken: address(usdc),
            venue: venue,
            prizePool: pool,
            startingCapital: CAPITAL,
            startTime: start,
            endTime: start + uint64(bound(duration, 1 hours, 3 days)),
            maxParticipants: uint32(bound(cap, 1, 4)),
            allowlistRoot: bytes32(0),
            prizeSplitBps: split,
            metadataURI: ""
        });

        usdc.mint(organizer, pool);
        vm.startPrank(organizer);
        usdc.approve(address(manager), pool);
        uint256 id = manager.createTournament(config);
        vm.stopPrank();

        ids.push(id);
        escrowed += pool;
    }

    function join(uint256 idSeed, uint256 actorSeed) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        address participant = _actor(actorSeed);
        address account = address(uint160(uint256(keccak256(abi.encode(id, participant)))));
        core.register(account, participant);
        core.setBalance(account, address(usdc), CAPITAL);

        vm.prank(participant);
        try manager.join(id, account, new bytes32[](0)) {
            _joined[id].push(participant);
        } catch {}
    }

    function postResults(uint256 idSeed, uint256 count) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        uint256 slots = manager.getConfig(id).prizeSplitBps.length;
        uint256 available = _joined[id].length;
        // Scoring an empty tournament ends it before anyone can join, which starves the claim path.
        if (available == 0) return;
        count = bound(count, 1, available < slots ? available : slots);

        address[] memory winners = new address[](count);
        for (uint256 i; i < count; ++i) {
            winners[i] = _joined[id][i];
        }
        // Jump to the end when needed, otherwise random sequences almost never reach the payout paths.
        uint64 endTime = manager.getConfig(id).endTime;
        if (block.timestamp < endTime) vm.warp(endTime);
        vm.prank(scorer);
        try manager.postResults(id, winners) {} catch {}
    }

    function voidResults(uint256 idSeed) external {
        if (ids.length == 0) return;
        vm.prank(admin);
        try manager.voidResults(_id(idSeed)) {} catch {}
    }

    function claim(uint256 idSeed, uint256 actorSeed) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        _passDisputeWindow(id);
        // Mostly aim at a real winner, sometimes at anyone, so both the paying and the rejecting paths run.
        address[] memory winners = manager.getWinners(id);
        address caller =
            winners.length != 0 && actorSeed % 4 != 0 ? winners[actorSeed % winners.length] : _actor(actorSeed);
        vm.prank(caller);
        try manager.claim(id) returns (uint256 amount) {
            claimed += amount;
        } catch {}
    }

    function sweep(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        _passDisputeWindow(id);
        try manager.sweep(id) returns (uint256 amount) {
            swept += amount;
        } catch {}
    }

    function cancel(uint256 idSeed, uint256 adminSeed) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        (address organizer,,,, uint256 unpaid) = manager.getState(id);
        // Admin cancels are rare so that most tournaments live long enough to be scored.
        vm.prank(adminSeed % 8 == 0 ? admin : organizer);
        try manager.cancel(id) {
            refunded += unpaid;
        } catch {}
    }

    function reclaim(uint256 idSeed) external {
        if (ids.length == 0) return;
        uint256 id = _id(idSeed);
        (address organizer,,,, uint256 unpaid) = manager.getState(id);
        vm.prank(organizer);
        try manager.reclaim(id) {
            refunded += unpaid;
        } catch {}
    }

    /// @dev Tokens sent to the contract by mistake. They must never count as escrow.
    function donate(uint256 amount) external {
        amount = bound(amount, 1, 1e12);
        usdc.mint(address(manager), amount);
        donated += amount;
    }

    function rescue(uint256 actorSeed) external {
        vm.prank(admin);
        try manager.rescue(address(usdc), _actor(actorSeed)) returns (uint256 amount) {
            rescued += amount;
        } catch {}
    }

    function warp(uint256 secs) external {
        // Short hops keep tournaments open long enough for participants to join before they end.
        vm.warp(block.timestamp + bound(secs, 1, 2 hours));
    }

    // ---------------------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------------------

    function _passDisputeWindow(uint256 id) internal {
        (, ITournamentManager.Status status,, uint64 claimableAt,) = manager.getState(id);
        if (status == ITournamentManager.Status.ResultsPosted && block.timestamp < claimableAt) vm.warp(claimableAt);
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _id(uint256 seed) internal view returns (uint256) {
        return ids[seed % ids.length];
    }
}
