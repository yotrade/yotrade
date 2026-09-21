// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ITournamentManager} from "./interfaces/ITournamentManager.sol";

/// @title TournamentStorage
/// @notice The single ERC-7201 namespace shared by every module. Append only: never reorder or remove a field.
abstract contract TournamentStorage {
    struct Tournament {
        address organizer;
        ITournamentManager.Status status;
        uint32 participantCount;
        uint64 claimableAt;
        uint256 unpaid;
        ITournamentManager.Config config;
        address[] winners;
        mapping(address participant => address tradingAccount) tradingAccountOf;
        mapping(address tradingAccount => bool used) tradingAccountUsed;
        mapping(address winner => uint256 rankPlusOne) rankOf;
        mapping(address winner => bool claimed) claimed;
        mapping(address participant => uint256 capital) capitalAtJoin;
    }

    /// @custom:storage-location erc7201:yotrade.storage.TournamentManager
    struct Layout {
        uint64 disputeWindow;
        uint256 count;
        mapping(uint256 id => Tournament) tournaments;
        mapping(address venue => bool approved) approvedVenues;
        /// Prize tokens owed by the contract, per token: the sum of `unpaid` over that token's tournaments.
        mapping(address token => uint256 amount) escrowed;
    }

    // keccak256(abi.encode(uint256(keccak256("yotrade.storage.TournamentManager")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant LAYOUT_SLOT = 0x3e2540b4dcde4a7e2126bd4e36c82edd4e4512588383e88f9b547a4d8aad8700;

    function _layout() internal pure returns (Layout storage $) {
        bytes32 slot = LAYOUT_SLOT;
        assembly {
            $.slot := slot
        }
    }
}
