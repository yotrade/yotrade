// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../src/TournamentManager.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Deploys the TournamentManager implementation behind an ERC-1967 proxy.
/// @dev forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
contract Deploy is Script {
    function run() external returns (address proxy, address implementation) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address scorer = vm.envAddress("SCORER_ADDRESS");
        address accountCore = vm.envAddress("ACCOUNT_CORE_ADDRESS");
        uint64 disputeWindow = uint64(vm.envUint("DISPUTE_WINDOW_SECONDS"));

        vm.startBroadcast(deployerKey);
        implementation = address(new TournamentManager());
        bytes memory init = abi.encodeCall(TournamentManager.initialize, (admin, scorer, accountCore, disputeWindow));
        proxy = address(new ERC1967Proxy(implementation, init));
        vm.stopBroadcast();

        console2.log("TournamentManager proxy:", proxy);
        console2.log("TournamentManager implementation:", implementation);
    }
}
