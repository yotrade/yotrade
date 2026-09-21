// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentBase} from "../TournamentBase.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";
import {IVenueAdapter} from "../interfaces/IVenueAdapter.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title RegistrationModule
/// @notice Who may enter a tournament, and with which trading account.
abstract contract RegistrationModule is TournamentBase {
    /// @inheritdoc ITournamentManager
    function join(uint256 id, address tradingAccount, bytes32[] calldata allowlistProof) external whenNotPaused {
        Tournament storage t = _open(id);
        Config storage config = t.config;

        if (block.timestamp >= config.endTime) revert TournamentEnded();
        if (tradingAccount == address(0)) revert ZeroAddress();
        if (t.tradingAccountOf[msg.sender] != address(0)) revert AlreadyJoined();
        if (t.tradingAccountUsed[tradingAccount]) revert TradingAccountTaken();
        if (t.participantCount >= config.maxParticipants) revert TournamentFull();

        if (config.allowlistRoot != bytes32(0)) {
            bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
            if (!MerkleProof.verifyCalldata(allowlistProof, config.allowlistRoot, leaf)) revert NotAllowlisted();
        }

        uint256 capital = _checkTradingAccount(tradingAccount, config);

        t.tradingAccountOf[msg.sender] = tradingAccount;
        t.tradingAccountUsed[tradingAccount] = true;
        t.capitalAtJoin[msg.sender] = capital;
        ++t.participantCount;

        emit Joined(id, msg.sender, tradingAccount, capital);
    }

    /// @dev The venue adapter proves ownership and reports the free balance; the capital rule is enforced here.
    function _checkTradingAccount(address tradingAccount, Config storage config)
        private
        view
        returns (uint256 capital)
    {
        capital = IVenueAdapter(config.venue).checkAccount(msg.sender, tradingAccount, config.capitalToken);

        // Not an equality check: venues may allow deposits into any account, so anyone could push one unit into
        // it and block the join. The recorded balance is the ROI denominator instead.
        if (capital < config.startingCapital) revert InsufficientStartingCapital(config.startingCapital, capital);
    }
}
