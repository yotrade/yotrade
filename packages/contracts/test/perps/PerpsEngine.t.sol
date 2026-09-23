// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IPerpsEngine} from "../../src/interfaces/IPerpsEngine.sol";
import {IPyth} from "../../src/interfaces/IPyth.sol";
import {ITournamentManager} from "../../src/interfaces/ITournamentManager.sol";
import {IVenueAdapter} from "../../src/interfaces/IVenueAdapter.sol";
import {PerpsEngine} from "../../src/perps/PerpsEngine.sol";
import {PerpsVenueAdapter} from "../../src/venues/PerpsVenueAdapter.sol";
import {MockPyth} from "../mocks/MockPyth.sol";
import {PerpsFixture} from "./PerpsFixture.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @dev Upgrade target that adds one function and keeps the storage layout.
contract PerpsEngineV2 is PerpsEngine {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract PerpsEngineTest is PerpsFixture {
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal outsider = makeAddr("outsider");

    int256 internal constant START = 10_000e18;
    uint256 internal id;
    uint64 internal start;
    uint64 internal end;

    function setUp() public {
        _deploy();
        start = uint64(vm.getBlockTimestamp() + 1 hours);
        end = start + 1 days;
        id = _create(address(adapter), start, end);
        // The cases below were written against 20x: 2.5% maintenance, 62 bps confidence.
        vm.prank(organizer);
        engine.setLeverageCap(id, 20);
        _join(id, alice);
        _join(id, bob);
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);
        vm.deal(outsider, 1 ether);
        vm.warp(start);
    }

    function _trade(address trader, bytes32 market, int256 sizeDelta, uint256 usd) internal {
        vm.prank(trader);
        engine.trade{value: 1}(id, market, sizeDelta, _one(_quote(market, usd)));
    }

    function _balance(address trader) internal view returns (int256 balance) {
        (balance,) = engine.accountOf(id, trader);
    }

    function _markets(address trader) internal view returns (bytes32[] memory markets) {
        (, markets) = engine.accountOf(id, trader);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Setup and administration
    // ---------------------------------------------------------------------------------------------------------

    function test_initialize_setsRolesAndRejectsZeroAddresses() public {
        assertTrue(engine.hasRole(engine.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(engine.hasRole(engine.PAUSER_ROLE(), admin));
        assertTrue(engine.hasRole(engine.UPGRADER_ROLE(), admin));

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        engine.initialize(admin, ITournamentManager(address(manager)), IPyth(address(pyth)), address(adapter), 0);

        address implementation = address(new PerpsEngine());
        address[4] memory args = [admin, address(manager), address(pyth), address(adapter)];
        for (uint256 i; i < 4; ++i) {
            address[4] memory a = args;
            a[i] = address(0);
            bytes memory init =
                abi.encodeCall(PerpsEngine.initialize, (a[0], ITournamentManager(a[1]), IPyth(a[2]), a[3], 0));
            vm.expectRevert(IPerpsEngine.ZeroAddress.selector);
            new ERC1967Proxy(implementation, init);
        }
    }

    function test_setMarket_onlyAdmin() public {
        bytes32 feed = keccak256("DOGE/USD");
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, engine.DEFAULT_ADMIN_ROLE()
            )
        );
        vm.prank(alice);
        engine.setMarket(feed, true);

        vm.expectEmit();
        emit IPerpsEngine.MarketUpdated(feed, true);
        vm.prank(admin);
        engine.setMarket(feed, true);
        assertTrue(engine.isMarketEnabled(feed));
    }

    function test_pause_blocksTradingAndLiquidation() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, engine.PAUSER_ROLE()
            )
        );
        vm.prank(alice);
        engine.pause();

        vm.prank(admin);
        engine.pause();
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(alice);
        engine.trade{value: 1}(id, BTC, 1e18, _one(_quote(BTC, 60_000)));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        engine.liquidate{value: 1}(id, alice, _one(_quote(BTC, 60_000)));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, engine.PAUSER_ROLE()
            )
        );
        vm.prank(alice);
        engine.unpause();
        vm.prank(admin);
        engine.unpause();
        _trade(alice, BTC, 1e18, 60_000);
    }

    function test_upgrade_onlyUpgraderAndKeepsState() public {
        _trade(alice, BTC, 1e18, 60_000);
        address v2 = address(new PerpsEngineV2());

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, engine.UPGRADER_ROLE()
            )
        );
        vm.prank(alice);
        engine.upgradeToAndCall(v2, "");

        vm.prank(admin);
        engine.upgradeToAndCall(v2, "");
        assertEq(PerpsEngineV2(address(engine)).version(), 2);
        assertEq(engine.positionOf(id, alice, BTC).size, 1e18);
    }

    function test_adapter_admitsOnlySelfOwnedAccounts() public {
        assertEq(adapter.checkAccount(alice, alice, address(0)), 10_000e6);
        vm.expectRevert(abi.encodeWithSelector(IVenueAdapter.NotAccountOwner.selector, bob, alice));
        adapter.checkAccount(alice, bob, address(0));
        assertEq(manager.capitalAtJoin(id, alice), 10_000e6);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------------------------------------------

    function test_accountOf_startsAtTheStartingBalance() public view {
        assertEq(_balance(alice), START);
        assertEq(_markets(alice).length, 0);
    }

    function test_trade_opensALong() public {
        // 1 BTC at 60,000: fee is 5 bps of 60,000 = 30.
        vm.expectEmit();
        emit IPerpsEngine.Traded(id, alice, BTC, 1e18, 60_000e18, 0, 30e18, 1e18, START - 30e18);
        _trade(alice, BTC, 1e18, 60_000);

        IPerpsEngine.Position memory p = engine.positionOf(id, alice, BTC);
        assertEq(p.size, 1e18);
        assertEq(p.entryPrice, 60_000e18);
        assertEq(_balance(alice), START - 30e18);
        assertEq(_markets(alice).length, 1);
        assertEq(_markets(alice)[0], BTC);
        assertEq(address(engine).balance, 0);
    }

    function test_trade_closesAShortAtAProfit() public {
        _trade(alice, BTC, -1e18, 60_000);
        vm.warp(vm.getBlockTimestamp() + 1);
        // Closing at 57,000: +3,000, fees 30 + 28.5.
        _trade(alice, BTC, 1e18, 57_000);

        assertEq(_balance(alice), START + 3000e18 - 30e18 - 28.5e18);
        assertEq(_markets(alice).length, 0);
        assertEq(engine.positionOf(id, alice, BTC).entryPrice, 0);
    }

    function test_trade_flipsThroughZero() public {
        _trade(alice, BTC, 1e18, 60_000);
        vm.warp(vm.getBlockTimestamp() + 1);
        _trade(alice, BTC, -3e18, 61_000);

        IPerpsEngine.Position memory p = engine.positionOf(id, alice, BTC);
        assertEq(p.size, -2e18);
        assertEq(p.entryPrice, 61_000e18);
        assertEq(_balance(alice), START + 1000e18 - 30e18 - 91.5e18);
        assertEq(_markets(alice).length, 1);
    }

    function test_trade_tracksOpenMarketsWithoutOrderAssumptions() public {
        _trade(alice, BTC, 1e17, 60_000);
        _trade(alice, ETH, 1e18, 3000);
        _trade(alice, SOL, 10e18, 150);
        // Closing the first market moves the last one into its slot; closing the last one pops it.
        _trade(alice, BTC, -1e17, 60_000);
        bytes32[] memory markets = _markets(alice);
        assertEq(markets.length, 2);
        assertEq(markets[0], SOL);
        assertEq(markets[1], ETH);

        _trade(alice, ETH, -1e18, 3000);
        markets = _markets(alice);
        assertEq(markets.length, 1);
        assertEq(markets[0], SOL);
    }

    function test_trade_floorsTheBalanceOnceFlat() public {
        _trade(alice, BTC, 3e18, 60_000);
        vm.warp(vm.getBlockTimestamp() + 1);
        // -12,000 on a 10,000 account: a paper account cannot owe.
        _trade(alice, BTC, -3e18, 56_000);
        assertEq(_balance(alice), 0);
    }

    function test_trade_keepsANegativeBalanceWhilePositionsRemain() public {
        _trade(alice, BTC, 3e18, 60_000);
        _trade(alice, ETH, 1e17, 3000);
        vm.warp(vm.getBlockTimestamp() + 1);
        _trade(alice, BTC, -3e18, 56_000);
        assertLt(_balance(alice), 0);
        assertEq(_markets(alice).length, 1);
    }

    function test_trade_revertsOnBadInput() public {
        vm.expectRevert(IPerpsEngine.ZeroSize.selector);
        _trade(alice, BTC, 0, 60_000);

        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.NotAParticipant.selector, outsider));
        _trade(outsider, BTC, 1e18, 60_000);

        bytes[] memory updates = _one(_quote(BTC, 60_000));
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.IncorrectFee.selector, 1));
        vm.prank(alice);
        engine.trade{value: 2}(id, BTC, 1e18, updates);
    }

    function test_trade_revertsForATournamentOnAnotherVenue() public {
        PerpsVenueAdapter other = new PerpsVenueAdapter();
        vm.prank(admin);
        manager.setVenueApproval(address(other), true);
        uint256 otherId =
            _create(address(other), uint64(vm.getBlockTimestamp() + 1), uint64(vm.getBlockTimestamp() + 1 days));
        _join(otherId, alice);
        vm.warp(vm.getBlockTimestamp() + 1);

        bytes[] memory updates = _one(_quote(BTC, 60_000));
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.WrongVenue.selector, address(other)));
        vm.prank(alice);
        engine.trade{value: 1}(otherId, BTC, 1e18, updates);
    }

    function test_trade_revertsOutsideTheWindow() public {
        vm.warp(start - 1);
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.TradingClosed.selector, start, end));
        _trade(alice, BTC, 1e18, 60_000);

        vm.warp(end);
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.TradingClosed.selector, start, end));
        _trade(alice, BTC, 1e18, 60_000);
    }

    function test_trade_revertsOnUnusablePrices() public {
        uint64 time = uint64(vm.getBlockTimestamp());
        // Confidence of 3% of the price.
        bytes[] memory wide = _one(_encode(BTC, 60_000e8, 1800e8, time, time - 1));
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.PriceTooUncertain.selector, BTC));
        vm.prank(alice);
        engine.trade{value: 1}(id, BTC, 1e18, wide);

        // An update older than the limit leaves the stored price stale.
        bytes[] memory old = _one(_encode(ETH, 3000e8, 0, time - 11, time - 12));
        vm.expectRevert(MockPyth.StalePrice.selector);
        vm.prank(alice);
        engine.trade{value: 1}(id, ETH, 1e18, old);
    }

    function test_trade_disabledMarketOnlyReduces() public {
        _trade(alice, BTC, 2e18, 60_000);
        vm.prank(admin);
        engine.setMarket(BTC, false);

        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.MarketDisabled.selector, BTC));
        _trade(alice, BTC, 1e17, 60_000);

        _trade(alice, BTC, -1e18, 60_000);
        assertEq(engine.positionOf(id, alice, BTC).size, 1e18);
    }

    function test_trade_enforcesTheLeverageCap() public {
        // 4 BTC is 240,000 of notional against 20 x (10,000 - 120).
        vm.expectRevert(
            abi.encodeWithSelector(IPerpsEngine.ExceedsLeverage.selector, 240_000e18, (START - 120e18) * 20)
        );
        _trade(alice, BTC, 4e18, 60_000);

        _trade(alice, BTC, 3e18, 60_000);
    }

    function test_trade_valuesTheWholeAccount() public {
        _trade(alice, BTC, 3e18, 60_000);
        vm.warp(vm.getBlockTimestamp() + 1);

        // Equity is below zero at 56,000, so nothing may be added anywhere.
        bytes[] memory updates = _two(_quote(BTC, 56_000), _quote(ETH, 3000));
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.ExceedsLeverage.selector, 168_300e18, 0));
        vm.prank(alice);
        engine.trade{value: 2}(id, ETH, 1e17, updates);

        // Without a fresh price for the open BTC position the account cannot be valued.
        vm.warp(vm.getBlockTimestamp() + 31);
        vm.expectRevert(MockPyth.StalePrice.selector);
        _trade(alice, ETH, 1e17, 3000);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Liquidation
    // ---------------------------------------------------------------------------------------------------------

    function test_liquidate_closesEverythingUnderMaintenance() public {
        _trade(alice, BTC, 3e18, 60_000);
        _trade(alice, ETH, 1e18, 3000);
        vm.warp(vm.getBlockTimestamp() + 1);

        // BTC at 57,500: equity 10,000 - 90 - 1.5 - 7,500 = 2,408.5 against 2.5% of 175,500 = 4,387.5.
        bytes[] memory updates = _two(_quote(BTC, 57_500), _quote(ETH, 3000));
        vm.expectEmit();
        emit IPerpsEngine.Liquidated(id, alice, bob, 2408.5e18);
        vm.prank(bob);
        engine.liquidate{value: 2}(id, alice, updates);

        assertEq(_balance(alice), 2408.5e18);
        assertEq(_markets(alice).length, 0);
        assertEq(engine.positionOf(id, alice, BTC).size, 0);
        assertEq(engine.positionOf(id, alice, ETH).size, 0);
    }

    function test_liquidate_floorsABankruptAccount() public {
        _trade(alice, BTC, 3e18, 60_000);
        vm.warp(vm.getBlockTimestamp() + 1);
        vm.prank(bob);
        engine.liquidate{value: 1}(id, alice, _one(_quote(BTC, 50_000)));
        assertEq(_balance(alice), 0);
    }

    function test_liquidate_revertsForAHealthyOrEmptyAccount() public {
        _trade(alice, BTC, 1e18, 60_000);
        bytes[] memory updates = _one(_quote(BTC, 60_000));

        vm.expectRevert(IPerpsEngine.NotLiquidatable.selector);
        engine.liquidate{value: 1}(id, alice, updates);
        vm.expectRevert(IPerpsEngine.NotLiquidatable.selector);
        engine.liquidate{value: 1}(id, bob, updates);
    }

    function test_liquidate_revertsAfterTheEnd() public {
        _trade(alice, BTC, 3e18, 60_000);
        vm.warp(end);
        bytes[] memory updates = _one(_quote(BTC, 50_000));
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.TradingClosed.selector, start, end));
        engine.liquidate{value: 1}(id, alice, updates);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------------------------------------------------

    function test_settle_usesTheFirstPriceAtTheEnd() public {
        _trade(alice, BTC, 1e18, 60_000);
        vm.warp(end + 30);

        // A later, better price is not the first one after the end.
        bytes[] memory late = _one(_encode(BTC, 70_000e8, 0, end + 20, end + 19));
        vm.expectRevert(MockPyth.PriceFeedNotFoundWithinRange.selector);
        engine.settle{value: 1}(id, alice, late);

        bytes[] memory first = _one(_encode(BTC, 62_000e8, 0, end, end - 1));
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.IncorrectFee.selector, 1));
        engine.settle(id, alice, first);

        vm.expectEmit();
        emit IPerpsEngine.Settled(id, alice, START - 30e18 + 2000e18);
        vm.prank(outsider);
        engine.settle{value: 1}(id, alice, first);

        assertEq(_balance(alice), START - 30e18 + 2000e18);
        assertEq(_markets(alice).length, 0);

        vm.expectRevert(IPerpsEngine.NothingToSettle.selector);
        engine.settle{value: 1}(id, alice, first);
    }

    function test_settle_worksWhilePausedAndFloors() public {
        _trade(alice, BTC, 3e18, 60_000);
        vm.prank(admin);
        engine.pause();
        vm.warp(end + 1);
        engine.settle{value: 1}(id, alice, _one(_encode(BTC, 40_000e8, 0, end + 1, end - 1)));
        assertEq(_balance(alice), 0);
    }

    function test_settle_revertsBeforeTheEnd() public {
        _trade(alice, BTC, 1e18, 60_000);
        bytes[] memory updates = _one(_quote(BTC, 60_000));
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.TournamentNotEnded.selector, end));
        engine.settle{value: 1}(id, alice, updates);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------------------------------------------

    /// @dev A round trip pays the price move minus two fees, and never leaves less than zero.
    // ---------------------------------------------------------------------------------------------------------
    // Leverage cap per tournament
    // ---------------------------------------------------------------------------------------------------------

    function test_setLeverageCap_onlyTheOrganizerBeforeTheStartWithAnAllowedValue() public {
        uint256 next = _create(address(adapter), end + 1 hours, end + 2 hours);
        assertEq(engine.leverageCapOf(next), 100);

        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.InvalidLeverage.selector, 50));
        vm.prank(organizer);
        engine.setLeverageCap(next, 50);

        vm.expectRevert(IPerpsEngine.NotOrganizer.selector);
        vm.prank(alice);
        engine.setLeverageCap(next, 100);

        vm.expectEmit();
        emit IPerpsEngine.LeverageCapUpdated(next, 100);
        vm.prank(organizer);
        engine.setLeverageCap(next, 100);
        assertEq(engine.leverageCapOf(next), 100);

        // The running tournament of the fixture has started: its cap is fixed.
        vm.expectRevert(IPerpsEngine.TournamentStarted.selector);
        vm.prank(organizer);
        engine.setLeverageCap(id, 5);

        // A tournament on another venue has no cap here.
        address other = makeAddr("other-venue");
        vm.prank(admin);
        manager.setVenueApproval(other, true);
        uint256 spot = _create(other, end + 1 hours, end + 2 hours);
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.WrongVenue.selector, other));
        vm.prank(organizer);
        engine.setLeverageCap(spot, 5);
    }

    /// @dev Two tournaments over the same window: one at 100x, one capped at 20x.
    function _hundredX() internal returns (uint256 next, uint256 plain) {
        next = _create(address(adapter), end + 1 hours, end + 2 hours);
        plain = _create(address(adapter), end + 1 hours, end + 2 hours);
        vm.prank(organizer);
        engine.setLeverageCap(next, 100);
        vm.prank(organizer);
        engine.setLeverageCap(plain, 20);
        _join(next, alice);
        _join(next, bob);
        _join(plain, bob);
        vm.warp(end + 1 hours);
    }

    function test_trade_atAHundredXTheCapMarginAndConfidenceFollow() public {
        (uint256 next, uint256 plain) = _hundredX();
        uint64 time = uint64(vm.getBlockTimestamp());

        // 15 BTC is 900,000 of notional against 100 x (10,000 - 450): fine at 100x, four times over at 20x.
        vm.prank(alice);
        engine.trade{value: 1}(next, BTC, 15e18, _one(_quote(BTC, 60_000)));
        assertEq(engine.positionOf(next, alice, BTC).size, 15e18);

        // Confidence of 0.3% is inside 20x's 62 bps and outside 100x's 12 bps.
        bytes[] memory noisy = _one(_encode(ETH, 3000e8, 9e8, time, time - 1));
        vm.expectRevert(abi.encodeWithSelector(IPerpsEngine.PriceTooUncertain.selector, ETH));
        vm.prank(bob);
        engine.trade{value: 1}(next, ETH, 1e18, noisy);
        vm.prank(bob);
        engine.trade{value: 1}(plain, ETH, 1e18, _one(_encode(ETH, 3000e8, 9e8, time, time - 1)));

        // BTC at 59,500: equity 10,000 - 450 - 7,500 = 2,050 against 0.5% of 892,500 = 4,462.5.
        vm.warp(time + 1);
        vm.expectEmit();
        emit IPerpsEngine.Liquidated(next, alice, bob, 2050e18);
        vm.prank(bob);
        engine.liquidate{value: 1}(next, alice, _one(_quote(BTC, 59_500)));
    }

    function testFuzz_roundTrip(int256 size, uint256 exit) public {
        size = bound(size, -3e18, 3e18);
        vm.assume(size != 0);
        exit = bound(exit, 30_000, 90_000);

        _trade(alice, BTC, size, 60_000);
        vm.warp(vm.getBlockTimestamp() + 1);
        _trade(alice, BTC, -size, exit);

        uint256 abs = uint256(size < 0 ? -size : size);
        int256 fees = int256(_ceilBps(abs * 60_000) + _ceilBps(abs * exit));
        int256 expected = START + size * (int256(exit) - 60_000) - fees;
        assertEq(_balance(alice), expected < 0 ? int256(0) : expected);
    }

    /// @dev Whatever is accepted from a flat account sits within the leverage cap.
    function testFuzz_acceptedFillsRespectTheCap(int256 size, uint256 usd) public {
        size = bound(size, -100e18, 100e18);
        vm.assume(size != 0);
        usd = bound(usd, 1000, 200_000);

        bytes[] memory updates = _one(_quote(BTC, usd));
        vm.prank(alice);
        try engine.trade{value: 1}(id, BTC, size, updates) {
            uint256 notional = uint256(size < 0 ? -size : size) * usd;
            assertLe(notional, uint256(_balance(alice)) * engine.leverageCapOf(id));
        } catch (bytes memory reason) {
            assertEq(bytes4(reason), IPerpsEngine.ExceedsLeverage.selector);
        }
    }

    /// @dev Five basis points of `value`, rounded up.
    function _ceilBps(uint256 value) private pure returns (uint256) {
        return (value * 5 + 9999) / 10_000;
    }
}
