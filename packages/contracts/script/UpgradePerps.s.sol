// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {PerpsEngine} from "../src/perps/PerpsEngine.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Deploys a new PerpsEngine implementation and points the proxy at it. The broadcaster needs
/// `UPGRADER_ROLE`. Always from a clean build: `forge clean` first.
/// @dev forge script script/UpgradePerps.s.sol --rpc-url monad_testnet --broadcast
contract UpgradePerps is Script {
    function run() external returns (address implementation) {
        uint256 upgraderKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxy = vm.envAddress("PERPS_ENGINE_PROXY");

        vm.startBroadcast(upgraderKey);
        implementation = address(new PerpsEngine());
        PerpsEngine(proxy).upgradeToAndCall(implementation, "");
        vm.stopBroadcast();

        console2.log("New implementation:", implementation);
    }
}
