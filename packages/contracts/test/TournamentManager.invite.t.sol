// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ITournamentManager} from "../src/interfaces/ITournamentManager.sol";
import {TournamentManagerTest} from "./TournamentManager.t.sol";

/// @notice Private tournaments: joining needs the invite code's signature, which the organizer can rotate.
contract TournamentManagerInviteTest is TournamentManagerTest {
    uint256 internal constant CODE = 0xA11CE;
    address internal signer = vm.addr(CODE);

    function _signature(uint256 code, uint256 id, address participant) internal view returns (bytes32[] memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(code, manager.inviteDigest(id, participant));
        bytes32[] memory proof = new bytes32[](3);
        (proof[0], proof[1], proof[2]) = (r, s, bytes32(uint256(v)));
        return proof;
    }

    function _private() internal returns (uint256 id) {
        id = _create();
        vm.prank(organizer);
        manager.setInvite(id, signer);
    }

    function test_SetInvite_OnlyOrganizerBeforeTheEnd() public {
        uint256 id = _create();
        vm.expectRevert(ITournamentManager.NotOrganizer.selector);
        vm.prank(alice);
        manager.setInvite(id, signer);

        vm.expectEmit();
        emit ITournamentManager.InviteUpdated(id, signer);
        vm.prank(organizer);
        manager.setInvite(id, signer);
        assertEq(manager.inviteSignerOf(id), signer);

        vm.warp(end);
        vm.expectRevert(ITournamentManager.TournamentEnded.selector);
        vm.prank(organizer);
        manager.setInvite(id, address(0));
    }

    function test_Join_NeedsTheInviteSignature() public {
        uint256 id = _private();
        address account = _tradingAccount(alice);

        vm.expectRevert(ITournamentManager.InvalidInvite.selector);
        vm.prank(alice);
        manager.join(id, account, new bytes32[](0));

        // Signatures are built first: `expectRevert` applies to the next call, and `inviteDigest` is a call.
        bytes32[] memory bobs = _signature(CODE, id, bob);
        bytes32[] memory wrongKey = _signature(0xB0B, id, alice);
        bytes32[] memory valid = _signature(CODE, id, alice);

        // Bob's signature does not admit Alice: the digest names the participant.
        vm.expectRevert(ITournamentManager.InvalidInvite.selector);
        vm.prank(alice);
        manager.join(id, account, bobs);

        // Another key, even a valid signature, is not the invite.
        vm.expectRevert(ITournamentManager.InvalidInvite.selector);
        vm.prank(alice);
        manager.join(id, account, wrongKey);

        vm.prank(alice);
        manager.join(id, account, valid);
        assertEq(manager.tradingAccountOf(id, alice), account);
    }

    function test_Join_RejectsMalformedSignatures() public {
        uint256 id = _private();
        address account = _tradingAccount(alice);
        bytes32[] memory proof = _signature(CODE, id, alice);

        proof[2] = bytes32(uint256(proof[2]) | (1 << 8));
        vm.expectRevert(ITournamentManager.InvalidInvite.selector);
        vm.prank(alice);
        manager.join(id, account, proof);

        proof = _signature(CODE, id, alice);
        proof[1] = bytes32(uint256(proof[1]) ^ 1);
        vm.expectRevert(ITournamentManager.InvalidInvite.selector);
        vm.prank(alice);
        manager.join(id, account, proof);
    }

    function test_Join_RotatedCodeInvalidatesTheOldLink() public {
        uint256 id = _private();
        bytes32[] memory old = _signature(CODE, id, alice);
        bytes32[] memory rotated = _signature(0xC0DE2, id, alice);
        vm.prank(organizer);
        manager.setInvite(id, vm.addr(0xC0DE2));

        address account = _tradingAccount(alice);
        vm.expectRevert(ITournamentManager.InvalidInvite.selector);
        vm.prank(alice);
        manager.join(id, account, old);

        vm.prank(alice);
        manager.join(id, account, rotated);

        // Clearing the invite opens entry again.
        vm.prank(organizer);
        manager.setInvite(id, address(0));
        _join(id, bob);
    }

    function test_Join_AllowlistAndInviteTogether() public {
        (bytes32 a, bytes32 b) = (_leaf(alice), _leaf(bob));
        ITournamentManager.Config memory config = _config();
        config.allowlistRoot = a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
        vm.prank(organizer);
        uint256 id = manager.createTournament(config);
        vm.prank(organizer);
        manager.setInvite(id, signer);

        bytes32[] memory signature = _signature(CODE, id, alice);
        bytes32[] memory proof = new bytes32[](4);
        (proof[0], proof[1], proof[2], proof[3]) = (b, signature[0], signature[1], signature[2]);
        address account = _tradingAccount(alice);
        vm.prank(alice);
        manager.join(id, account, proof);

        // The signature alone is not an allowlist proof.
        address carols = _tradingAccount(carol);
        bytes32[] memory carolsSignature = _signature(CODE, id, carol);
        vm.expectRevert(ITournamentManager.NotAllowlisted.selector);
        vm.prank(carol);
        manager.join(id, carols, carolsSignature);
    }

    function test_InviteDigest_IsBoundToChainContractTournamentAndParticipant() public view {
        bytes32 digest = manager.inviteDigest(1, alice);
        assertTrue(digest != manager.inviteDigest(2, alice));
        assertTrue(digest != manager.inviteDigest(1, bob));
    }

    function testFuzz_Join_AnyCodeWorksOnlyForItsOwnSigner(uint256 code, uint256 other) public {
        code = bound(code, 1, 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140);
        other = bound(other, 1, 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140);
        vm.assume(code != other);
        uint256 id = _create();
        vm.prank(organizer);
        manager.setInvite(id, vm.addr(code));
        address account = _tradingAccount(alice);
        bytes32[] memory wrong = _signature(other, id, alice);
        bytes32[] memory right = _signature(code, id, alice);

        vm.expectRevert(ITournamentManager.InvalidInvite.selector);
        vm.prank(alice);
        manager.join(id, account, wrong);

        vm.prank(alice);
        manager.join(id, account, right);
    }
}
