// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../src/TournamentManager.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Deploys a new implementation and points the proxy at it. The broadcaster needs `UPGRADER_ROLE`.
/// @dev forge script script/Upgrade.s.sol --rpc-url monad_testnet --broadcast
contract Upgrade is Script {
    function run() external returns (address implementation) {
        uint256 upgraderKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxy = vm.envAddress("TOURNAMENT_MANAGER_PROXY");

        vm.startBroadcast(upgraderKey);
        implementation = address(new TournamentManager());
        TournamentManager(proxy).upgradeToAndCall(implementation, "");
        vm.stopBroadcast();

        console2.log("New implementation:", implementation);
    }
}
