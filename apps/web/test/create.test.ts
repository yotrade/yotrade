import { describe, expect, test } from "bun:test";

import { buildConfig, type CreateForm } from "../src/lib/create.ts";
import { tournamentName } from "../src/lib/format.ts";

const FORM: CreateForm = {
  name: "  Jogja Cup 🏆 ",
  prizePool: "250.5",
  startDelay: "In 10 minutes",
  duration: "1 day",
  maxParticipants: "30",
  split: "Top 3",
};

describe("buildConfig", () => {
  test("builds the contract config and a name the app can read back", () => {
    const result = buildConfig(FORM, 1_000n);
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.config.prizePool).toBe(250_500_000n);
    expect(result.config.startTime).toBe(1_600n);
    expect(result.config.endTime).toBe(88_000n);
    expect(result.config.prizeSplitBps.reduce((sum, bps) => sum + bps, 0)).toBe(10_000);
    expect(tournamentName(1n, result.config.metadataURI)).toBe("Jogja Cup 🏆");
  });

  test("rejects what the contract would reject, naming the field", () => {
    const bad = (patch: Partial<CreateForm>) => {
      const result = buildConfig({ ...FORM, ...patch }, 0n);
      return result.ok ? "ok" : result.field;
    };
    expect(bad({ name: "   " })).toBe("name");
    expect(bad({ name: "🏆".repeat(60) })).toBe("name");
    expect(bad({ prizePool: "-5" })).toBe("prizePool");
    expect(bad({ prizePool: "1.1234567" })).toBe("prizePool");
    expect(bad({ prizePool: "10001" })).toBe("prizePool");
    expect(bad({ maxParticipants: "1" })).toBe("maxParticipants");
    expect(bad({ maxParticipants: "2.5" })).toBe("maxParticipants");
    expect(bad({ prizePool: "0" })).toBe("ok");
  });
});
