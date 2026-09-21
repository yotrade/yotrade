// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IAccountCore} from "./interfaces/IAccountCore.sol";
import {ITournamentManager} from "./interfaces/ITournamentManager.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title TournamentManager
/// @notice Registry and prize escrow for community trading tournaments.
/// @dev Scores are computed offchain from the venue's public data and posted by `SCORER_ROLE`. They only become
/// claimable after a dispute window during which the admin can void them. UUPS upgradeable, ERC-7201 storage.
contract TournamentManager is
    ITournamentManager,
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    bytes32 public constant SCORER_ROLE = keccak256("SCORER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_WINNERS = 20;
    uint64 public constant MAX_DISPUTE_WINDOW = 7 days;
    /// @notice Time after `endTime` without results before the organizer can take the pool back.
    uint64 public constant RESULTS_GRACE = 7 days;

    struct Tournament {
        address organizer;
        Status status;
        uint32 participantCount;
        uint64 claimableAt;
        uint256 unpaid;
        Config config;
        address[] winners;
        mapping(address participant => address tradingAccount) tradingAccountOf;
        mapping(address tradingAccount => bool used) tradingAccountUsed;
        mapping(address winner => uint256 rankPlusOne) rankOf;
        mapping(address winner => bool claimed) claimed;
    }

    /// @custom:storage-location erc7201:yotrade.storage.TournamentManager
    struct Layout {
        IAccountCore accountCore;
        uint64 disputeWindow;
        uint256 count;
        mapping(uint256 id => Tournament) tournaments;
    }

    // keccak256(abi.encode(uint256(keccak256("yotrade.storage.TournamentManager")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant LAYOUT_SLOT = 0x3e2540b4dcde4a7e2126bd4e36c82edd4e4512588383e88f9b547a4d8aad8700;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param admin Receives the admin, pauser and upgrader roles.
    /// @param scorer Receives the scorer role.
    /// @param accountCore_ Kuru `AccountCore` proxy. Zero disables onchain trading-account checks.
    /// @param disputeWindow_ Seconds between results being posted and prizes becoming claimable.
    function initialize(address admin, address scorer, address accountCore_, uint64 disputeWindow_)
        external
        initializer
    {
        if (admin == address(0) || scorer == address(0)) revert ZeroAddress();
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
        _grantRole(SCORER_ROLE, scorer);

        _setAccountCore(accountCore_);
        _setDisputeWindow(disputeWindow_);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Organizer
    // ---------------------------------------------------------------------------------------------------------

    /// @inheritdoc ITournamentManager
    function createTournament(Config calldata config) external whenNotPaused nonReentrant returns (uint256 id) {
        if (config.startTime <= block.timestamp || config.endTime <= config.startTime) revert InvalidSchedule();
        if (config.maxParticipants == 0) revert InvalidCap();
        if (config.startingCapital != 0 && config.capitalToken == address(0)) revert ZeroAddress();
        if (config.prizePool != 0 && config.prizeToken == address(0)) revert InvalidPrizeToken();
        _validateSplit(config.prizeSplitBps);

        Layout storage $ = _layout();
        id = ++$.count;
        Tournament storage t = $.tournaments[id];
        t.organizer = msg.sender;
        t.status = Status.Open;
        t.config = config;

        if (config.prizePool != 0) {
            IERC20 token = IERC20(config.prizeToken);
            uint256 before = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), config.prizePool);
            uint256 received = token.balanceOf(address(this)) - before;
            // Fee-on-transfer and rebasing tokens would make the pool insolvent.
            if (received != config.prizePool) revert PrizeTransferMismatch(config.prizePool, received);
            t.unpaid = received;
        }

        emit TournamentCreated(id, msg.sender, config);
    }

    /// @inheritdoc ITournamentManager
    /// @dev The organizer may cancel until trading starts. The admin may cancel any open tournament, for example
    /// when the venue is down.
    function cancel(uint256 id) external nonReentrant {
        Tournament storage t = _open(id);
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            if (msg.sender != t.organizer) revert NotOrganizer();
            if (block.timestamp >= t.config.startTime) revert TournamentStarted();
        }
        _refund(id, t);
    }

    /// @inheritdoc ITournamentManager
    /// @dev Guarantees the pool cannot get stuck if results are never posted.
    function reclaim(uint256 id) external nonReentrant {
        Tournament storage t = _open(id);
        if (msg.sender != t.organizer) revert NotOrganizer();
        uint64 reclaimableAt = t.config.endTime + RESULTS_GRACE;
        if (block.timestamp < reclaimableAt) revert GracePeriodActive(reclaimableAt);
        _refund(id, t);
    }

    /// @inheritdoc ITournamentManager
    /// @dev Returns whatever is not owed to an unclaimed winner: unfilled ranks and rounding dust.
    function sweep(uint256 id) external nonReentrant returns (uint256 amount) {
        Tournament storage t = _claimable(id);
        uint256 owed;
        uint256 length = t.winners.length;
        for (uint256 i; i < length; ++i) {
            if (!t.claimed[t.winners[i]]) owed += _prize(t, i);
        }
        amount = t.unpaid - owed;
        if (amount == 0) revert NothingToSweep();
        t.unpaid = owed;
        IERC20(t.config.prizeToken).safeTransfer(t.organizer, amount);
        emit RemainderSwept(id, amount);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Participant
    // ---------------------------------------------------------------------------------------------------------

    /// @inheritdoc ITournamentManager
    function join(uint256 id, address tradingAccount, bytes32[] calldata allowlistProof) external whenNotPaused {
        Layout storage $ = _layout();
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

        IAccountCore core = $.accountCore;
        if (address(core) != address(0)) {
            if (core.userRegistry(tradingAccount) == 0) revert AccountNotRegistered();
            if (core.getAccountOwner(tradingAccount) != msg.sender) revert NotAccountOwner();
            if (config.startingCapital != 0) {
                uint256 balance = core.getBalance(tradingAccount, config.capitalToken);
                if (balance != config.startingCapital) revert WrongStartingCapital(config.startingCapital, balance);
            }
        }

        t.tradingAccountOf[msg.sender] = tradingAccount;
        t.tradingAccountUsed[tradingAccount] = true;
        ++t.participantCount;

        emit Joined(id, msg.sender, tradingAccount);
    }

    /// @inheritdoc ITournamentManager
    function claim(uint256 id) external nonReentrant returns (uint256 amount) {
        Tournament storage t = _claimable(id);
        uint256 rankPlusOne = t.rankOf[msg.sender];
        if (rankPlusOne == 0) revert NotWinner();
        if (t.claimed[msg.sender]) revert AlreadyClaimed();

        t.claimed[msg.sender] = true;
        amount = _prize(t, rankPlusOne - 1);
        t.unpaid -= amount;
        if (amount != 0) IERC20(t.config.prizeToken).safeTransfer(msg.sender, amount);

        emit PrizeClaimed(id, msg.sender, rankPlusOne, amount);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Scorer and admin
    // ---------------------------------------------------------------------------------------------------------

    /// @inheritdoc ITournamentManager
    /// @param winners Participants ranked best first. May be shorter than the prize split.
    function postResults(uint256 id, address[] calldata winners) external onlyRole(SCORER_ROLE) {
        Tournament storage t = _open(id);
        if (block.timestamp < t.config.endTime) revert TournamentNotEnded();
        if (winners.length > t.config.prizeSplitBps.length) revert TooManyWinners();

        for (uint256 i; i < winners.length; ++i) {
            address winner = winners[i];
            if (t.tradingAccountOf[winner] == address(0)) revert NotParticipant(winner);
            if (t.rankOf[winner] != 0) revert DuplicateWinner(winner);
            t.rankOf[winner] = i + 1;
        }

        t.winners = winners;
        t.status = Status.ResultsPosted;
        // Fixed at posting time so later changes to the window never move a pending tournament.
        uint64 claimableAt = uint64(block.timestamp) + _layout().disputeWindow;
        t.claimableAt = claimableAt;

        emit ResultsPosted(id, winners, claimableAt);
    }

    /// @inheritdoc ITournamentManager
    /// @dev Only possible while no prize can have been claimed yet.
    function voidResults(uint256 id) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Tournament storage t = _layout().tournaments[id];
        if (t.status != Status.ResultsPosted) revert WrongStatus(t.status);
        if (block.timestamp >= t.claimableAt) revert DisputeWindowOver();

        uint256 length = t.winners.length;
        for (uint256 i; i < length; ++i) {
            delete t.rankOf[t.winners[i]];
        }
        delete t.winners;
        t.status = Status.Open;
        t.claimableAt = 0;

        emit ResultsVoided(id);
    }

    function setAccountCore(address accountCore_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setAccountCore(accountCore_);
    }

    function setDisputeWindow(uint64 disputeWindow_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setDisputeWindow(disputeWindow_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------------------

    function accountCore() external view returns (address) {
        return address(_layout().accountCore);
    }

    function disputeWindow() external view returns (uint64) {
        return _layout().disputeWindow;
    }

    /// @inheritdoc ITournamentManager
    function tournamentCount() external view returns (uint256) {
        return _layout().count;
    }

    /// @inheritdoc ITournamentManager
    function getConfig(uint256 id) external view returns (Config memory) {
        return _layout().tournaments[id].config;
    }

    /// @inheritdoc ITournamentManager
    function getState(uint256 id)
        external
        view
        returns (address organizer, Status status, uint32 participantCount, uint64 claimableAt, uint256 unpaid)
    {
        Tournament storage t = _layout().tournaments[id];
        return (t.organizer, t.status, t.participantCount, t.claimableAt, t.unpaid);
    }

    /// @inheritdoc ITournamentManager
    function getWinners(uint256 id) external view returns (address[] memory) {
        return _layout().tournaments[id].winners;
    }

    /// @inheritdoc ITournamentManager
    function tradingAccountOf(uint256 id, address participant) external view returns (address) {
        return _layout().tournaments[id].tradingAccountOf[participant];
    }

    /// @inheritdoc ITournamentManager
    function prizeOf(uint256 id, address account) external view returns (uint256 amount, bool claimed) {
        Tournament storage t = _layout().tournaments[id];
        uint256 rankPlusOne = t.rankOf[account];
        if (rankPlusOne == 0) return (0, false);
        return (_prize(t, rankPlusOne - 1), t.claimed[account]);
    }

    // ---------------------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------------------

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    function _layout() private pure returns (Layout storage $) {
        bytes32 slot = LAYOUT_SLOT;
        assembly {
            $.slot := slot
        }
    }

    function _open(uint256 id) private view returns (Tournament storage t) {
        t = _layout().tournaments[id];
        if (t.status != Status.Open) revert WrongStatus(t.status);
    }

    function _claimable(uint256 id) private view returns (Tournament storage t) {
        t = _layout().tournaments[id];
        if (t.status != Status.ResultsPosted) revert WrongStatus(t.status);
        if (block.timestamp < t.claimableAt) revert DisputeWindowActive(t.claimableAt);
    }

    function _prize(Tournament storage t, uint256 rank) private view returns (uint256) {
        return (t.config.prizePool * t.config.prizeSplitBps[rank]) / BPS;
    }

    function _refund(uint256 id, Tournament storage t) private {
        uint256 amount = t.unpaid;
        t.unpaid = 0;
        t.status = Status.Cancelled;
        if (amount != 0) IERC20(t.config.prizeToken).safeTransfer(t.organizer, amount);
        emit TournamentCancelled(id, amount);
    }

    function _validateSplit(uint16[] calldata split) private pure {
        uint256 length = split.length;
        if (length == 0 || length > MAX_WINNERS) revert InvalidSplit();
        uint256 total;
        for (uint256 i; i < length; ++i) {
            if (split[i] == 0) revert InvalidSplit();
            total += split[i];
        }
        if (total != BPS) revert InvalidSplit();
    }

    function _setAccountCore(address accountCore_) private {
        _layout().accountCore = IAccountCore(accountCore_);
        emit AccountCoreUpdated(accountCore_);
    }

    function _setDisputeWindow(uint64 disputeWindow_) private {
        if (disputeWindow_ > MAX_DISPUTE_WINDOW) revert InvalidSchedule();
        _layout().disputeWindow = disputeWindow_;
        emit DisputeWindowUpdated(disputeWindow_);
    }
}
