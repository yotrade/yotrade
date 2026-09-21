// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IProfileRegistry} from "./interfaces/IProfileRegistry.sol";

/// @title ProfileRegistry
/// @notice Display names and avatars for tournament accounts.
/// @dev Deliberately immutable, ownerless and unable to hold value: there is nothing to pause, rescue or upgrade,
/// so there is no privileged role to compromise. New fields mean a new registry indexed next to this one.
contract ProfileRegistry is IProfileRegistry {
    /// @notice Longest accepted name, in bytes.
    uint256 public constant MAX_NAME_LENGTH = 32;

    struct Profile {
        uint8 avatar;
        string name;
    }

    mapping(address account => Profile profile) private _profiles;

    /// @inheritdoc IProfileRegistry
    function setProfile(string calldata name, uint8 avatar) external {
        uint256 length = bytes(name).length;
        if (length > MAX_NAME_LENGTH) revert NameTooLong(length);

        Profile storage profile = _profiles[msg.sender];
        profile.avatar = avatar;
        profile.name = name;

        emit ProfileSet(msg.sender, name, avatar);
    }

    /// @inheritdoc IProfileRegistry
    function profileOf(address account) external view returns (string memory name, uint8 avatar) {
        Profile storage profile = _profiles[account];
        return (profile.name, profile.avatar);
    }
}
