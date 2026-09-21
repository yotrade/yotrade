// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IPyth} from "../../src/interfaces/IPyth.sol";

/// @dev Pyth's pull oracle with the same rules and none of the cryptography. An update is
/// `abi.encode(id, price, conf, expo, publishTime, prevPublishTime)`.
contract MockPyth is IPyth {
    error InsufficientFee();
    error PriceFeedNotFound();
    error StalePrice();
    error PriceFeedNotFoundWithinRange();

    uint256 public constant FEE_PER_UPDATE = 1;
    mapping(bytes32 id => Price price) internal _latest;

    function getUpdateFee(bytes[] calldata updateData) public pure returns (uint256) {
        return updateData.length * FEE_PER_UPDATE;
    }

    function updatePriceFeeds(bytes[] calldata updateData) external payable {
        if (msg.value < getUpdateFee(updateData)) revert InsufficientFee();
        for (uint256 i; i < updateData.length; ++i) {
            (bytes32 id, Price memory price,) = _decode(updateData[i]);
            // Like the real contract, an update that is not newer is ignored rather than rejected.
            if (price.publishTime > _latest[id].publishTime) _latest[id] = price;
        }
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory price) {
        price = _latest[id];
        if (price.publishTime == 0) revert PriceFeedNotFound();
        uint256 diff = block.timestamp > price.publishTime
            ? block.timestamp - price.publishTime
            : price.publishTime - block.timestamp;
        if (diff > age) revert StalePrice();
    }

    function parsePriceFeedUpdatesUnique(
        bytes[] calldata updateData,
        bytes32[] calldata priceIds,
        uint64 minPublishTime,
        uint64 maxPublishTime
    ) external payable returns (PriceFeed[] memory feeds) {
        if (msg.value < getUpdateFee(updateData)) revert InsufficientFee();
        feeds = new PriceFeed[](priceIds.length);
        for (uint256 i; i < priceIds.length; ++i) {
            feeds[i] = _find(updateData, priceIds[i], minPublishTime, maxPublishTime);
        }
    }

    function _find(bytes[] calldata updateData, bytes32 wanted, uint64 minPublishTime, uint64 maxPublishTime)
        private
        pure
        returns (PriceFeed memory feed)
    {
        for (uint256 i; i < updateData.length; ++i) {
            (bytes32 id, Price memory price, uint64 prev) = _decode(updateData[i]);
            bool first = prev < minPublishTime && price.publishTime >= minPublishTime;
            if (id == wanted && first && price.publishTime <= maxPublishTime) return PriceFeed(id, price, price);
        }
        revert PriceFeedNotFoundWithinRange();
    }

    function _decode(bytes calldata update) private pure returns (bytes32 id, Price memory price, uint64 prev) {
        uint64 publishTime;
        (id, price.price, price.conf, price.expo, publishTime, prev) =
            abi.decode(update, (bytes32, int64, uint64, int32, uint64, uint64));
        price.publishTime = publishTime;
    }
}
