export const STATUSES = ["none", "open", "resultsPosted", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];

/** Where a tournament is in its life, from the point of view of someone looking at it right now. */
export type Phase =
  | "unknown"
  | "upcoming"
  | "live"
  | "scoring"
  | "dispute"
  | "claimable"
  | "cancelled";

export interface Schedule {
  readonly status: Status;
  readonly startTime: bigint;
  readonly endTime: bigint;
  /** Zero until results are posted. */
  readonly claimableAt: bigint;
}

export function toStatus(value: number): Status {
  const status = STATUSES[value];
  if (status === undefined) {
    throw new RangeError(`Unknown tournament status ${value}`);
  }
  return status;
}

export function phaseAt(schedule: Schedule, nowSeconds: bigint): Phase {
  switch (schedule.status) {
    case "none":
      return "unknown";
    case "cancelled":
      return "cancelled";
    case "resultsPosted":
      return nowSeconds < schedule.claimableAt ? "dispute" : "claimable";
    case "open":
      if (nowSeconds < schedule.startTime) {
        return "upcoming";
      }
      return nowSeconds < schedule.endTime ? "live" : "scoring";
  }
}
