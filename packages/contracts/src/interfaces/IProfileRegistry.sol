// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title IProfileRegistry
/// @notice Self-declared display names and avatars. Anyone can set their own; nobody can set another's.
interface IProfileRegistry {
    /// @notice Emitted every time `account` sets its profile, including when nothing changed.
    event ProfileSet(address indexed account, string name, uint8 avatar);

    /// @notice `name` is longer than `MAX_NAME_LENGTH` bytes.
    error NameTooLong(uint256 length);

    /// @notice Sets the caller's profile.
    /// @param name UTF-8, at most `MAX_NAME_LENGTH` bytes. Untrusted text: clients must render it as text.
    /// @param avatar Index into the client's avatar set. Unknown values are the client's to handle.
    function setProfile(string calldata name, uint8 avatar) external;

    /// @notice Profile of `account`. An empty name and avatar zero when none was ever set.
    function profileOf(address account) external view returns (string memory name, uint8 avatar);
}
