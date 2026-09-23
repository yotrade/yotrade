// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IPerpsEngine} from "../interfaces/IPerpsEngine.sol";
import {IPyth} from "../interfaces/IPyth.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";

/// @title PerpsStorage
/// @notice ERC-7201 namespace of the perps engine. Append only: never reorder or remove a field.
abstract contract PerpsStorage {
    struct Account {
        /// Realized profit minus fees, USD 1e18. The cash balance is the starting balance plus this, so an
        /// account needs no opening step.
        int256 realized;
        /// Markets with a non-zero position, in no particular order.
        bytes32[] openMarkets;
        mapping(bytes32 market => IPerpsEngine.Position) positions;
    }

    /// @custom:storage-location erc7201:yotrade.storage.PerpsEngine
    struct Layout {
        ITournamentManager manager;
        IPyth pyth;
        /// The venue adapter a tournament must name in its config to trade here.
        address adapter;
        mapping(bytes32 market => bool enabled) markets;
        mapping(uint256 tournamentId => mapping(address trader => Account)) accounts;
        /// Zero means the default. Set by the organizer before the start.
        mapping(uint256 tournamentId => uint256 cap) leverageCaps;
    }

    // keccak256(abi.encode(uint256(keccak256("yotrade.storage.PerpsEngine")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant LAYOUT_SLOT = 0xfec990dfd61b0154ad6e5eb6a7163fb5f1e79242f81cd9b228eb827da3616e00;

    function _layout() internal pure returns (Layout storage $) {
        bytes32 slot = LAYOUT_SLOT;
        assembly {
            $.slot := slot
        }
    }
}
