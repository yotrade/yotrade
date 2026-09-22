// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {TournamentBase} from "../TournamentBase.sol";
import {ITournamentManager} from "../interfaces/ITournamentManager.sol";
import {IVenueAdapter} from "../interfaces/IVenueAdapter.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

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

        _checkEntry(id, config.allowlistRoot, allowlistProof);

        uint256 capital = _checkTradingAccount(tradingAccount, config);

        t.tradingAccountOf[msg.sender] = tradingAccount;
        t.tradingAccountUsed[tradingAccount] = true;
        t.capitalAtJoin[msg.sender] = capital;
        ++t.participantCount;

        emit Joined(id, msg.sender, tradingAccount, capital);
    }

    /// @inheritdoc ITournamentManager
    function setInvite(uint256 id, address signer) external {
        Tournament storage t = _open(id);
        if (msg.sender != t.organizer) revert NotOrganizer();
        if (block.timestamp >= t.config.endTime) revert TournamentEnded();
        _layout().inviteSigners[id] = signer;
        emit InviteUpdated(id, signer);
    }

    /// @inheritdoc ITournamentManager
    function inviteSignerOf(uint256 id) external view returns (address) {
        return _layout().inviteSigners[id];
    }

    /// @inheritdoc ITournamentManager
    function inviteDigest(uint256 id, address participant) public view returns (bytes32) {
        return MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode("YoTrade invite", block.chainid, address(this), id, participant))
        );
    }

    /// @dev An allowlist takes the proof's first entries, an invite the last three: `[r, s, v]`.
    function _checkEntry(uint256 id, bytes32 root, bytes32[] calldata proof) private view {
        address signer = _layout().inviteSigners[id];
        uint256 merkleLength = signer == address(0) ? proof.length : proof.length - (proof.length < 3 ? 0 : 3);
        if (root != bytes32(0)) {
            bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender))));
            if (!MerkleProof.verifyCalldata(proof[:merkleLength], root, leaf)) revert NotAllowlisted();
        }
        if (signer == address(0)) return;
        if (proof.length < 3) revert InvalidInvite();
        // The v byte is the low byte of the last word; anything else in that word is a malformed proof.
        uint256 v = uint256(proof[proof.length - 1]);
        if (v > 0xff) revert InvalidInvite();
        // `v` was just bounded to one byte.
        // forge-lint: disable-start(unsafe-typecast)
        (address recovered, ECDSA.RecoverError err, bytes32 detail) =
            ECDSA.tryRecover(inviteDigest(id, msg.sender), uint8(v), proof[proof.length - 3], proof[proof.length - 2]);
        // forge-lint: disable-end(unsafe-typecast)
        if (err != ECDSA.RecoverError.NoError || detail != bytes32(0) || recovered != signer) revert InvalidInvite();
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
