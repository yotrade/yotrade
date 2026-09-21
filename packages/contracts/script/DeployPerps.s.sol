// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../src/TournamentManager.sol";
import {IPyth} from "../src/interfaces/IPyth.sol";
import {ITournamentManager} from "../src/interfaces/ITournamentManager.sol";
import {PerpsEngine} from "../src/perps/PerpsEngine.sol";
import {PerpsVenueAdapter} from "../src/venues/PerpsVenueAdapter.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Deploys the futures venue: the adapter and the PerpsEngine behind an ERC-1967 proxy.
/// @dev forge script script/DeployPerps.s.sol --rpc-url monad_testnet --broadcast
contract DeployPerps is Script {
    // Pyth feeds that publish around the clock (https://www.pyth.network/developers/price-feed-ids).
    bytes32 internal constant BTC_USD = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 internal constant ETH_USD = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 internal constant SOL_USD = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;
    bytes32 internal constant MON_USD = 0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1;

    function run() external returns (address proxy, address implementation, address adapter) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address manager = vm.envAddress("TOURNAMENT_MANAGER_PROXY");
        address pyth = vm.envAddress("PYTH_ADDRESS");
        uint48 adminTransferDelay = uint48(vm.envOr("ADMIN_TRANSFER_DELAY_SECONDS", uint256(0)));

        vm.startBroadcast(deployerKey);
        adapter = address(new PerpsVenueAdapter());
        implementation = address(new PerpsEngine());
        bytes memory init = abi.encodeCall(
            PerpsEngine.initialize, (admin, ITournamentManager(manager), IPyth(pyth), adapter, adminTransferDelay)
        );
        proxy = address(new ERC1967Proxy(implementation, init));

        // Only the admin can enable markets and approve venues. Someone else deploying leaves both to the admin.
        if (vm.addr(deployerKey) == admin) {
            bytes32[4] memory markets = [BTC_USD, ETH_USD, SOL_USD, MON_USD];
            for (uint256 i; i < markets.length; ++i) {
                PerpsEngine(proxy).setMarket(markets[i], true);
            }
            TournamentManager(manager).setVenueApproval(adapter, true);
        } else {
            console2.log("ACTION REQUIRED: admin must enable markets and call setVenueApproval(adapter, true)");
        }
        vm.stopBroadcast();

        console2.log("PerpsEngine proxy:", proxy);
        console2.log("PerpsEngine implementation:", implementation);
        console2.log("PerpsVenueAdapter:", adapter);
    }
}
