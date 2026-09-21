// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ProfileRegistry} from "../src/ProfileRegistry.sol";
import {IProfileRegistry} from "../src/interfaces/IProfileRegistry.sol";
import {Test} from "forge-std/Test.sol";

contract ProfileRegistryTest is Test {
    ProfileRegistry internal registry;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        registry = new ProfileRegistry();
    }

    function test_ProfileOf_IsEmptyBeforeAnythingIsSet() public view {
        (string memory name, uint8 avatar) = registry.profileOf(alice);
        assertEq(name, "");
        assertEq(avatar, 0);
    }

    function test_SetProfile_StoresAndEmits() public {
        vm.expectEmit(address(registry));
        emit IProfileRegistry.ProfileSet(alice, "satoshi", 3);
        vm.prank(alice);
        registry.setProfile("satoshi", 3);

        (string memory name, uint8 avatar) = registry.profileOf(alice);
        assertEq(name, "satoshi");
        assertEq(avatar, 3);
    }

    function test_SetProfile_OnlyTouchesTheCaller() public {
        vm.prank(alice);
        registry.setProfile("alice", 1);
        vm.prank(bob);
        registry.setProfile("bob", 2);

        (string memory aliceName, uint8 aliceAvatar) = registry.profileOf(alice);
        (string memory bobName, uint8 bobAvatar) = registry.profileOf(bob);
        assertEq(aliceName, "alice");
        assertEq(aliceAvatar, 1);
        assertEq(bobName, "bob");
        assertEq(bobAvatar, 2);
    }

    function test_SetProfile_OverwritesIncludingBackToEmpty() public {
        vm.startPrank(alice);
        registry.setProfile("first", 9);
        registry.setProfile("", 0);
        vm.stopPrank();

        (string memory name, uint8 avatar) = registry.profileOf(alice);
        assertEq(name, "");
        assertEq(avatar, 0);
    }

    function test_SetProfile_AcceptsExactlyTheMaximumLength() public {
        string memory name = "abcdefghijklmnopqrstuvwxyz012345";
        assertEq(bytes(name).length, registry.MAX_NAME_LENGTH());
        vm.prank(alice);
        registry.setProfile(name, 0);
        (string memory stored,) = registry.profileOf(alice);
        assertEq(stored, name);
    }

    function test_SetProfile_RevertsOneByteOverTheMaximum() public {
        string memory name = "abcdefghijklmnopqrstuvwxyz0123456";
        vm.expectRevert(abi.encodeWithSelector(IProfileRegistry.NameTooLong.selector, 33));
        vm.prank(alice);
        registry.setProfile(name, 0);
    }

    /// @dev Length is measured in bytes, not characters: eleven four-byte emoji are 44 bytes.
    function test_SetProfile_CountsBytesNotCharacters() public {
        string memory name = unicode"🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆🏆";
        vm.expectRevert(abi.encodeWithSelector(IProfileRegistry.NameTooLong.selector, 44));
        vm.prank(alice);
        registry.setProfile(name, 0);
    }

    function testFuzz_SetProfile_RoundTrips(address account, string calldata name, uint8 avatar) public {
        vm.assume(bytes(name).length <= registry.MAX_NAME_LENGTH());
        vm.prank(account);
        registry.setProfile(name, avatar);

        (string memory storedName, uint8 storedAvatar) = registry.profileOf(account);
        assertEq(storedName, name);
        assertEq(storedAvatar, avatar);
    }

    function testFuzz_SetProfile_RejectsAnythingLonger(string calldata name) public {
        vm.assume(bytes(name).length > registry.MAX_NAME_LENGTH());
        vm.expectRevert(abi.encodeWithSelector(IProfileRegistry.NameTooLong.selector, bytes(name).length));
        registry.setProfile(name, 0);
    }
}
