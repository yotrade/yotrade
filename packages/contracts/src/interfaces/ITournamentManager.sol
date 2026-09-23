// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @title ITournamentManager
/// @notice Lifecycle of community trading tournaments: registration, prize escrow, results and claims.
interface ITournamentManager {
    enum Status {
        None,
        Open,
        ResultsPosted,
        Cancelled
    }

    /// @param prizeToken ERC-20 escrowed as the prize pool. May be zero when `prizePool` is zero.
    /// @param capitalToken Token the starting capital is denominated in (the venue's quote asset).
    /// @param venue Admin-approved `IVenueAdapter` that proves participants own their trading accounts.
    /// @param prizePool Amount of `prizeToken` pulled from the organizer at creation.
    /// @param startingCapital Minimum free balance of `capitalToken` a trading account must hold to join. The actual
    /// balance is recorded and used as the ROI denominator. Zero skips the check.
    /// @param startTime Trading starts. Must be in the future at creation.
    /// @param endTime Trading ends. Results can be posted from this moment.
    /// @param maxParticipants Hard cap on registrations.
    /// @param allowlistRoot Merkle root of allowed participants. Zero means open to anyone.
    /// @param prizeSplitBps Share of the pool per rank, best first. Must sum to 10_000.
    /// @param metadataURI Offchain description (name, rules, markets).
    struct Config {
        address prizeToken;
        address capitalToken;
        address venue;
        uint256 prizePool;
        uint256 startingCapital;
        uint64 startTime;
        uint64 endTime;
        uint32 maxParticipants;
        bytes32 allowlistRoot;
        uint16[] prizeSplitBps;
        string metadataURI;
    }

    event TournamentCreated(uint256 indexed id, address indexed organizer, Config config);
    event Joined(
        uint256 indexed id, address indexed participant, address indexed tradingAccount, uint256 capitalAtJoin
    );
    event ResultsPosted(uint256 indexed id, address[] winners, uint64 claimableAt);
    event ResultsVoided(uint256 indexed id);
    event PrizeClaimed(uint256 indexed id, address indexed winner, uint256 rank, uint256 amount);
    event TournamentCancelled(uint256 indexed id, uint256 refunded);
    event RemainderSwept(uint256 indexed id, uint256 amount);
    event VenueApprovalUpdated(address indexed venue, bool approved);
    event Rescued(address indexed token, address indexed to, uint256 amount);
    event DisputeWindowUpdated(uint64 disputeWindow);
    event InviteUpdated(uint256 indexed id, address indexed signer);
    event MetadataUpdated(uint256 indexed id, string metadataURI);
    event ScheduleUpdated(uint256 indexed id, uint64 startTime, uint64 endTime);

    error ZeroAddress();
    error InvalidSchedule();
    error InvalidSplit();
    error InvalidCap();
    error InvalidPrizeToken();
    error VenueNotApproved(address venue);
    error MetadataTooLong();
    error NothingToRescue();
    error PrizeTransferMismatch(uint256 expected, uint256 received);
    error WrongStatus(Status current);
    error TournamentEnded();
    error TournamentNotEnded();
    error TournamentStarted();
    error TournamentFull();
    error AlreadyJoined();
    error TradingAccountTaken();
    error NotAllowlisted();
    error InvalidInvite();
    error InsufficientStartingCapital(uint256 required, uint256 actual);
    error TooManyWinners();
    error NotParticipant(address account);
    error DuplicateWinner(address account);
    error DisputeWindowActive(uint64 claimableAt);
    error DisputeWindowOver();
    error NotWinner();
    error AlreadyClaimed();
    error NotOrganizer();
    error GracePeriodActive(uint64 reclaimableAt);
    error NothingToSweep();

    function createTournament(Config calldata config) external returns (uint256 id);

    /// @notice Registers `msg.sender` with `tradingAccount`. `allowlistProof` is the Merkle proof when the
    /// tournament has an allowlist, and `[r, s, v]` of the invite code's signature over
    /// `inviteDigest(id, participant)` when it has an invite. A tournament may require both, in that order.
    function join(uint256 id, address tradingAccount, bytes32[] calldata allowlistProof) external;

    /// @notice Sets or rotates the invite code's signer. Only the organizer, only before the end. Zero opens entry.
    function setInvite(uint256 id, address signer) external;

    function inviteSignerOf(uint256 id) external view returns (address);

    /// @notice Replaces the metadata URI. Only the organizer, only while open and before the end.
    function setMetadata(uint256 id, string calldata metadataURI) external;

    /// @notice Starts an upcoming tournament now and keeps its duration. Only the organizer, only before the start.
    function startNow(uint256 id) external;

    /// @notice What the invite code signs: bound to this chain, contract, tournament and participant, so a
    /// signature cannot be replayed elsewhere or by someone else.
    function inviteDigest(uint256 id, address participant) external view returns (bytes32);

    function postResults(uint256 id, address[] calldata winners) external;

    function voidResults(uint256 id) external;

    function claim(uint256 id) external returns (uint256 amount);

    function cancel(uint256 id) external;

    function reclaim(uint256 id) external;

    function sweep(uint256 id) external returns (uint256 amount);

    function rescue(address token, address to) external returns (uint256 amount);

    function isVenueApproved(address venue) external view returns (bool);

    function escrowed(address token) external view returns (uint256);

    function tournamentCount() external view returns (uint256);

    function getConfig(uint256 id) external view returns (Config memory);

    function getState(uint256 id)
        external
        view
        returns (address organizer, Status status, uint32 participantCount, uint64 claimableAt, uint256 unpaid);

    function getWinners(uint256 id) external view returns (address[] memory);

    function tradingAccountOf(uint256 id, address participant) external view returns (address);

    function capitalAtJoin(uint256 id, address participant) external view returns (uint256);

    function prizeOf(uint256 id, address account) external view returns (uint256 amount, bool claimed);
}
