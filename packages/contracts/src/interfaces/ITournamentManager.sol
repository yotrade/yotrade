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
    /// @param prizePool Amount of `prizeToken` pulled from the organizer at creation.
    /// @param startingCapital Exact free balance of `capitalToken` a trading account must hold to join. Zero skips
    /// the check.
    /// @param startTime Trading starts. Must be in the future at creation.
    /// @param endTime Trading ends. Results can be posted from this moment.
    /// @param maxParticipants Hard cap on registrations.
    /// @param allowlistRoot Merkle root of allowed participants. Zero means open to anyone.
    /// @param prizeSplitBps Share of the pool per rank, best first. Must sum to 10_000.
    /// @param metadataURI Offchain description (name, rules, markets).
    struct Config {
        address prizeToken;
        address capitalToken;
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
    event Joined(uint256 indexed id, address indexed participant, address indexed tradingAccount);
    event ResultsPosted(uint256 indexed id, address[] winners, uint64 claimableAt);
    event ResultsVoided(uint256 indexed id);
    event PrizeClaimed(uint256 indexed id, address indexed winner, uint256 rank, uint256 amount);
    event TournamentCancelled(uint256 indexed id, uint256 refunded);
    event RemainderSwept(uint256 indexed id, uint256 amount);
    event AccountCoreUpdated(address indexed accountCore);
    event DisputeWindowUpdated(uint64 disputeWindow);

    error ZeroAddress();
    error InvalidSchedule();
    error InvalidSplit();
    error InvalidCap();
    error InvalidPrizeToken();
    error PrizeTransferMismatch(uint256 expected, uint256 received);
    error WrongStatus(Status current);
    error TournamentEnded();
    error TournamentNotEnded();
    error TournamentStarted();
    error TournamentFull();
    error AlreadyJoined();
    error TradingAccountTaken();
    error NotAllowlisted();
    error AccountNotRegistered();
    error NotAccountOwner();
    error WrongStartingCapital(uint256 expected, uint256 actual);
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

    function join(uint256 id, address tradingAccount, bytes32[] calldata allowlistProof) external;

    function postResults(uint256 id, address[] calldata winners) external;

    function voidResults(uint256 id) external;

    function claim(uint256 id) external returns (uint256 amount);

    function cancel(uint256 id) external;

    function reclaim(uint256 id) external;

    function sweep(uint256 id) external returns (uint256 amount);

    function tournamentCount() external view returns (uint256);

    function getConfig(uint256 id) external view returns (Config memory);

    function getState(uint256 id)
        external
        view
        returns (address organizer, Status status, uint32 participantCount, uint64 claimableAt, uint256 unpaid);

    function getWinners(uint256 id) external view returns (address[] memory);

    function tradingAccountOf(uint256 id, address participant) external view returns (address);

    function prizeOf(uint256 id, address account) external view returns (uint256 amount, bool claimed);
}
