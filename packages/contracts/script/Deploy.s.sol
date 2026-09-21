// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentManager} from "../src/TournamentManager.sol";
import {IAccountCore} from "../src/interfaces/IAccountCore.sol";
import {KuruVenueAdapter} from "../src/venues/KuruVenueAdapter.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Script, console2} from "forge-std/Script.sol";

/// @notice Deploys the Kuru venue adapter and the TournamentManager behind an ERC-1967 proxy.
/// @dev forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast
contract Deploy is Script {
    function run() external returns (address proxy, address implementation, address kuruVenue) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address scorer = vm.envAddress("SCORER_ADDRESS");
        address accountCore = vm.envAddress("ACCOUNT_CORE_ADDRESS");
        uint64 disputeWindow = uint64(vm.envUint("DISPUTE_WINDOW_SECONDS"));
        uint48 adminTransferDelay = uint48(vm.envOr("ADMIN_TRANSFER_DELAY_SECONDS", uint256(0)));

        vm.startBroadcast(deployerKey);
        kuruVenue = address(new KuruVenueAdapter(IAccountCore(accountCore)));
        implementation = address(new TournamentManager());
        bytes memory init =
            abi.encodeCall(TournamentManager.initialize, (admin, scorer, disputeWindow, adminTransferDelay));
        proxy = address(new ERC1967Proxy(implementation, init));

        // Only the admin can approve venues. When someone else deploys, the admin approves it afterwards.
        if (vm.addr(deployerKey) == admin) {
            TournamentManager(proxy).setVenueApproval(kuruVenue, true);
        } else {
            console2.log("ACTION REQUIRED: admin must call setVenueApproval(kuruVenue, true)");
        }
        vm.stopBroadcast();

        console2.log("TournamentManager proxy:", proxy);
        console2.log("TournamentManager implementation:", implementation);
        console2.log("KuruVenueAdapter:", kuruVenue);
    }
}
