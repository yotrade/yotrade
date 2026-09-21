// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title IPyth
/// @notice The part of Pyth's pull oracle this project uses. Signatures and struct layouts match the deployed
/// contract (https://docs.pyth.network/price-feeds/api-reference/evm).
interface IPyth {
    /// @dev `price * 10^expo` is the price; `conf` is the confidence interval in the same units.
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    struct PriceFeed {
        bytes32 id;
        Price price;
        Price emaPrice;
    }

    /// @notice Fee in wei for `updateData`.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 feeAmount);

    /// @notice Verifies and stores the updates. Reverts on an invalid update or an insufficient fee.
    function updatePriceFeeds(bytes[] calldata updateData) external payable;

    /// @notice Latest stored price, reverting when it is older than `age` seconds.
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory price);

    /// @notice Parses updates without storing them and returns, per id, the **first** update whose publish time
    /// is at or after `minPublishTime`: its previous publish time must be before it. Nobody can pick a later,
    /// more convenient price inside the window.
    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PriceFeed[] memory priceFeeds);
}
