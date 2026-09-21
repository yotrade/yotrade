// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ProfileRegistry} from "../src/ProfileRegistry.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Deploys the ownerless ProfileRegistry.
/// @dev forge script script/DeployProfileRegistry.s.sol --rpc-url monad_testnet --broadcast
contract DeployProfileRegistry is Script {
    function run() external returns (address registry) {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        registry = address(new ProfileRegistry());
        vm.stopBroadcast();
        console2.log("ProfileRegistry:", registry);
    }
}
