// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IPerpsEngine} from "../../src/interfaces/IPerpsEngine.sol";
import {PerpsEngine} from "../../src/perps/PerpsEngine.sol";
import {PerpsFixture} from "../perps/PerpsFixture.sol";
import {Test} from "forge-std/Test.sol";

/// @notice Random traders, random prices, random liquidators.
contract PerpsHandler is Test {
    PerpsEngine public immutable engine;
    uint256 public immutable id;
    bytes32[3] public markets;
    address[] public actors;
    mapping(bytes32 market => uint256 usd) public priceOf;
    uint256 public fills;
    uint256 public liquidations;

    constructor(PerpsEngine engine_, uint256 id_, bytes32[3] memory markets_, address[] memory actors_) {
        (engine, id, markets, actors) = (engine_, id_, markets_, actors_);
        (priceOf[markets_[0]], priceOf[markets_[1]], priceOf[markets_[2]]) = (60_000, 3000, 150);
    }

    function trade(uint256 actorSeed, uint256 marketSeed, int256 sizeDelta) external {
        bytes32 market = markets[marketSeed % 3];
        // Up to 15x of the starting balance per fill: the cap is hit often and a 10% move liquidates.
        sizeDelta = bound(sizeDelta, -150_000e18, 150_000e18) / int256(priceOf[market]);
        bytes[] memory updates = _updates();
        vm.prank(actors[actorSeed % actors.length]);
        try engine.trade{value: 3}(id, market, sizeDelta, updates) {
            ++fills;
        } catch {}
    }

    function liquidate(uint256 actorSeed) external {
        bytes[] memory updates = _updates();
        try engine.liquidate{value: 3}(id, actors[actorSeed % actors.length], updates) {
            ++liquidations;
        } catch {}
    }

    /// @dev Moves one market by up to 10% and the clock by a second, so the next update is newer.
    function move(uint256 marketSeed, uint256 bps, bool up) external {
        bytes32 market = markets[marketSeed % 3];
        uint256 delta = priceOf[market] * bound(bps, 0, 1000) / 10_000;
        priceOf[market] = up ? priceOf[market] + delta : priceOf[market] - delta;
        if (priceOf[market] == 0) priceOf[market] = 1;
        vm.warp(vm.getBlockTimestamp() + 1);
    }

    function _updates() internal view returns (bytes[] memory updates) {
        uint64 time = uint64(vm.getBlockTimestamp());
        updates = new bytes[](3);
        for (uint256 i; i < 3; ++i) {
            updates[i] = abi.encode(markets[i], int64(uint64(priceOf[markets[i]] * 1e8)), 0, int32(-8), time, time - 1);
        }
    }
}

contract PerpsEngineInvariantTest is PerpsFixture {
    PerpsHandler internal handler;
    address[] internal actors;
    uint256 internal id;

    function setUp() public {
        _deploy();
        id = _create(address(adapter), uint64(vm.getBlockTimestamp() + 1), uint64(vm.getBlockTimestamp() + 300 days));
        for (uint256 i; i < 4; ++i) {
            actors.push(makeAddr(string.concat("trader-", vm.toString(i))));
            _join(id, actors[i]);
        }
        vm.warp(vm.getBlockTimestamp() + 1);

        handler = new PerpsHandler(engine, id, [BTC, ETH, SOL], actors);
        vm.deal(address(handler), 1 ether);
        for (uint256 i; i < 4; ++i) {
            vm.deal(actors[i], 1 ether);
        }
        targetContract(address(handler));
    }

    /// @dev `openMarkets` lists exactly the markets with a position, once each.
    function invariant_openMarketsMatchPositions() public view {
        bytes32[3] memory all = [BTC, ETH, SOL];
        for (uint256 i; i < actors.length; ++i) {
            (, bytes32[] memory open) = engine.accountOf(id, actors[i]);
            uint256 withPosition;
            for (uint256 m; m < 3; ++m) {
                IPerpsEngine.Position memory p = engine.positionOf(id, actors[i], all[m]);
                if (p.size != 0) ++withPosition;
                assertEq(p.size == 0, p.entryPrice == 0, "entry price without a position");
            }
            assertEq(open.length, withPosition, "open markets out of sync");
            for (uint256 a; a < open.length; ++a) {
                assertTrue(engine.positionOf(id, actors[i], open[a]).size != 0, "listed market is flat");
                for (uint256 b = a + 1; b < open.length; ++b) {
                    assertTrue(open[a] != open[b], "market listed twice");
                }
            }
        }
    }

    /// @dev A flat account never owes: losses beyond the balance are floored when the last position closes.
    function invariant_flatAccountsNeverOwe() public view {
        for (uint256 i; i < actors.length; ++i) {
            (int256 balance, bytes32[] memory open) = engine.accountOf(id, actors[i]);
            if (open.length == 0) assertGe(balance, 0, "flat account owes");
        }
    }

    /// @dev The exact Pyth fee is forwarded on every call, so the engine never holds MON.
    function invariant_engineHoldsNoMon() public view {
        assertEq(address(engine).balance, 0);
    }
}
