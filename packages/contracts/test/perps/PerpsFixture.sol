// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../../src/TournamentManager.sol";
import {IPyth} from "../../src/interfaces/IPyth.sol";
import {ITournamentManager} from "../../src/interfaces/ITournamentManager.sol";
import {PerpsEngine} from "../../src/perps/PerpsEngine.sol";
import {PerpsVenueAdapter} from "../../src/venues/PerpsVenueAdapter.sol";
import {MockPyth} from "../mocks/MockPyth.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test} from "forge-std/Test.sol";

/// @notice The real TournamentManager and PerpsEngine behind proxies, a mock Pyth, and one futures tournament.
abstract contract PerpsFixture is Test {
    TournamentManager internal manager;
    PerpsEngine internal engine;
    PerpsVenueAdapter internal adapter;
    MockPyth internal pyth;

    address internal admin = makeAddr("admin");
    address internal scorer = makeAddr("scorer");
    address internal organizer = makeAddr("organizer");

    bytes32 internal constant BTC = keccak256("BTC/USD");
    bytes32 internal constant ETH = keccak256("ETH/USD");
    bytes32 internal constant SOL = keccak256("SOL/USD");
    int32 internal constant EXPO = -8;

    function _deploy() internal {
        vm.warp(1_800_000_000);
        pyth = new MockPyth();
        adapter = new PerpsVenueAdapter();

        bytes memory init = abi.encodeCall(TournamentManager.initialize, (admin, scorer, 1 hours, 0));
        manager = TournamentManager(address(new ERC1967Proxy(address(new TournamentManager()), init)));
        init = abi.encodeCall(
            PerpsEngine.initialize,
            (admin, ITournamentManager(address(manager)), IPyth(address(pyth)), address(adapter), 0)
        );
        engine = PerpsEngine(address(new ERC1967Proxy(address(new PerpsEngine()), init)));

        vm.startPrank(admin);
        manager.setVenueApproval(address(adapter), true);
        engine.setMarket(BTC, true);
        engine.setMarket(ETH, true);
        engine.setMarket(SOL, true);
        vm.stopPrank();
    }

    function _create(address venue, uint64 start, uint64 end) internal returns (uint256 id) {
        uint16[] memory split = new uint16[](1);
        split[0] = 10_000;
        vm.prank(organizer);
        id = manager.createTournament(
            ITournamentManager.Config({
                prizeToken: address(0),
                capitalToken: address(0),
                venue: venue,
                prizePool: 0,
                startingCapital: 0,
                startTime: start,
                endTime: end,
                maxParticipants: 100,
                allowlistRoot: bytes32(0),
                prizeSplitBps: split,
                metadataURI: ""
            })
        );
    }

    function _join(uint256 id, address trader) internal {
        vm.prank(trader);
        manager.join(id, trader, new bytes32[](0));
    }

    /// @dev One update per market, published now. `usd` is a whole-dollar price.
    function _quote(bytes32 market, uint256 usd) internal view returns (bytes memory) {
        uint64 time = uint64(vm.getBlockTimestamp());
        return _encode(market, int64(uint64(usd * 1e8)), 0, time, time - 1);
    }

    /// @dev Internal on purpose: an external call here would swallow the caller's `prank` or `expectRevert`.
    function _encode(bytes32 market, int64 price, uint64 conf, uint64 publishTime, uint64 prevPublishTime)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(market, price, conf, EXPO, publishTime, prevPublishTime);
    }

    function _one(bytes memory update) internal pure returns (bytes[] memory updates) {
        updates = new bytes[](1);
        updates[0] = update;
    }

    function _two(bytes memory a, bytes memory b) internal pure returns (bytes[] memory updates) {
        updates = new bytes[](2);
        (updates[0], updates[1]) = (a, b);
    }
}
