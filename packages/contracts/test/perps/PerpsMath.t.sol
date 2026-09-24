// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {PerpsMath} from "../../src/perps/PerpsMath.sol";
import {Test} from "forge-std/Test.sol";

/// @dev Library calls are inlined into the test, so reverts are checked through this external wrapper.
contract PerpsMathHarness {
    function toWad(int64 price, int32 expo) external pure returns (uint256) {
        return PerpsMath.toWad(price, expo);
    }

    function addsRisk(int256 was, int256 becomes) external pure returns (bool) {
        return PerpsMath.addsRisk(was, becomes);
    }

    function applyFill(int256 size, uint256 entry, int256 delta, uint256 price)
        external
        pure
        returns (int256, uint256, int256)
    {
        return PerpsMath.applyFill(size, entry, delta, price);
    }
}

contract PerpsMathTest is Test {
    PerpsMathHarness internal math = new PerpsMathHarness();

    int256 internal constant ONE = 1e18;
    uint256 internal constant P100 = 100e18;

    function test_AddsRisk_GrowingOrFlippingDoesReducingDoesNot() public view {
        assertTrue(math.addsRisk(0, ONE));
        assertTrue(math.addsRisk(ONE, 2 * ONE));
        assertTrue(math.addsRisk(-ONE, -2 * ONE));
        // A flip adds risk even when the new side is smaller.
        assertTrue(math.addsRisk(10 * ONE, -ONE));
        assertTrue(math.addsRisk(-10 * ONE, ONE));
        assertFalse(math.addsRisk(2 * ONE, ONE));
        assertFalse(math.addsRisk(-2 * ONE, -ONE));
        assertFalse(math.addsRisk(ONE, 0));
        assertFalse(math.addsRisk(ONE, ONE));
    }

    function test_ToWad_ScalesPythExponents() public view {
        // BTC at 85,466.34 with Pyth's usual exponent of -8.
        assertEq(math.toWad(8_546_634_000_000, -8), 85_466.34e18);
        assertEq(math.toWad(3, 0), 3e18);
        assertEq(math.toWad(1, -18), 1);
    }

    function test_ToWad_RevertsOnBadInputs() public {
        vm.expectRevert(PerpsMath.InvalidPrice.selector);
        math.toWad(0, -8);
        vm.expectRevert(PerpsMath.InvalidPrice.selector);
        math.toWad(-1, -8);
        vm.expectRevert(PerpsMath.InvalidPrice.selector);
        math.toWad(1, 1);
        vm.expectRevert(PerpsMath.InvalidPrice.selector);
        math.toWad(1, -19);
    }

    function test_Notional_Pnl_Abs() public pure {
        assertEq(PerpsMath.abs(-5), 5);
        assertEq(PerpsMath.abs(5), 5);
        assertEq(PerpsMath.notional(-2 * ONE, P100), 200e18);
        assertEq(PerpsMath.pnl(2 * ONE, P100, 110e18), 20e18);
        assertEq(PerpsMath.pnl(-2 * ONE, P100, 110e18), -20e18);
    }

    function test_Fee_RoundsUpAndIsZeroForNothing() public pure {
        // 5 bps of 200 USD is exactly 0.1 USD.
        assertEq(PerpsMath.fee(2 * ONE, P100, 5), 0.1e18);
        // One wei of notional still pays one wei.
        assertEq(PerpsMath.fee(1, 1e18, 5), 1);
        assertEq(PerpsMath.fee(0, P100, 5), 0);
        assertEq(PerpsMath.fee(ONE, P100, 0), 0);
    }

    function test_ApplyFill_OpensAndAveragesIn() public view {
        (int256 size, uint256 entry, int256 realized) = math.applyFill(0, 0, ONE, P100);
        assertEq(size, ONE);
        assertEq(entry, P100);
        assertEq(realized, 0);

        (size, entry, realized) = math.applyFill(ONE, P100, 3 * ONE, 120e18);
        assertEq(size, 4 * ONE);
        assertEq(entry, 115e18);
        assertEq(realized, 0);

        (size, entry,) = math.applyFill(-ONE, P100, -ONE, 80e18);
        assertEq(size, -2 * ONE);
        assertEq(entry, 90e18);
    }

    function test_ApplyFill_ReducesAndKeepsTheEntry() public view {
        (int256 size, uint256 entry, int256 realized) = math.applyFill(4 * ONE, P100, -ONE, 110e18);
        assertEq(size, 3 * ONE);
        assertEq(entry, P100);
        assertEq(realized, 10e18);

        (size, entry, realized) = math.applyFill(-4 * ONE, P100, ONE, 110e18);
        assertEq(size, -3 * ONE);
        assertEq(entry, P100);
        assertEq(realized, -10e18);
    }

    function test_ApplyFill_ClosesFlat() public view {
        (int256 size, uint256 entry, int256 realized) = math.applyFill(2 * ONE, P100, -2 * ONE, 90e18);
        assertEq(size, 0);
        assertEq(entry, 0);
        assertEq(realized, -20e18);
    }

    function test_ApplyFill_FlipsAndRestartsTheEntry() public view {
        (int256 size, uint256 entry, int256 realized) = math.applyFill(2 * ONE, P100, -5 * ONE, 110e18);
        assertEq(size, -3 * ONE);
        assertEq(entry, 110e18);
        assertEq(realized, 20e18);

        (size, entry, realized) = math.applyFill(-2 * ONE, P100, 5 * ONE, 110e18);
        assertEq(size, 3 * ONE);
        assertEq(entry, 110e18);
        assertEq(realized, -20e18);
    }

    /// @dev Going in and straight back out at one price realizes nothing, whatever the size and side.
    function testFuzz_RoundTripAtOnePriceRealizesNothing(int128 rawSize, uint64 rawPrice) public view {
        int256 delta = int256(rawSize);
        vm.assume(delta != 0 && delta != type(int128).min);
        uint256 price = uint256(rawPrice) + 1;

        (int256 size, uint256 entry,) = math.applyFill(0, 0, delta, price);
        (int256 flat, uint256 flatEntry, int256 realized) = math.applyFill(size, entry, -delta, price);
        assertEq(flat, 0);
        assertEq(flatEntry, 0);
        assertEq(realized, 0);
    }

    /// @dev A long and a short of the same size realize opposite amounts over the same move.
    function testFuzz_LongAndShortAreMirrorImages(uint96 rawSize, uint64 rawEntry, uint64 rawExit) public view {
        int256 size = int256(uint256(rawSize)) + 1;
        uint256 entry = uint256(rawEntry) + 1;
        uint256 exit = uint256(rawExit) + 1;

        (,, int256 long) = math.applyFill(size, entry, -size, exit);
        (,, int256 short) = math.applyFill(-size, entry, size, exit);
        assertEq(long, -short);
    }

    /// @dev Closing in two steps realizes the same as closing at once, up to one wei of rounding per step.
    function testFuzz_SplittingACloseChangesNothing(uint96 rawSize, uint96 rawPart, uint64 rawEntry, uint64 rawExit)
        public
        view
    {
        int256 size = int256(uint256(rawSize)) + 2;
        int256 part = int256(bound(uint256(rawPart), 1, uint256(size) - 1));
        uint256 entry = uint256(rawEntry) + 1;
        uint256 exit = uint256(rawExit) + 1;

        (,, int256 once) = math.applyFill(size, entry, -size, exit);
        (int256 rest, uint256 restEntry, int256 first) = math.applyFill(size, entry, -part, exit);
        (,, int256 second) = math.applyFill(rest, restEntry, -rest, exit);
        assertApproxEqAbs(first + second, once, 1);
    }

    /// @dev The entry price of an added-to position always lies between the two prices that built it.
    function testFuzz_AveragedEntryStaysBetweenItsPrices(uint96 a, uint96 b, uint64 rawP1, uint64 rawP2) public view {
        int256 first = int256(uint256(a)) + 1;
        int256 second = int256(uint256(b)) + 1;
        uint256 p1 = uint256(rawP1) + 1;
        uint256 p2 = uint256(rawP2) + 1;

        (int256 size, uint256 entry,) = math.applyFill(first, p1, second, p2);
        assertEq(size, first + second);
        assertGe(entry, p1 < p2 ? p1 : p2 - 1);
        assertLe(entry, p1 < p2 ? p2 : p1);
    }
}
