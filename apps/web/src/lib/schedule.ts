export interface Scheduled {
  readonly startTime: bigint;
  readonly endTime: bigint;
}

/**
 * The indexed tournament with its start and end taken from the chain when the chain has answered. A host's
 * Start now moves both at once; the indexer follows seconds or minutes later, and nobody should wait for it.
 */
export function withChainSchedule<T extends Scheduled>(indexed: T, chain: Scheduled | undefined): T {
  if (!chain || (chain.startTime === indexed.startTime && chain.endTime === indexed.endTime)) {
    return indexed;
  }
  return { ...indexed, startTime: chain.startTime, endTime: chain.endTime };
}
