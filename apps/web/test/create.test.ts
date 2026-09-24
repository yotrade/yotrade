import { describe, expect, test } from "bun:test";

import {
  buildConfig,
  buildMetadata,
  type CreateForm,
  nextName,
  rematchForm,
} from "../src/lib/create.ts";
import { isPrivate, tournamentMeta, tournamentName } from "../src/lib/format.ts";

const FORM: CreateForm = {
  venue: "spot",
  visibility: "public",
  image: "",
  name: "  Jogja Cup 🏆 ",
  prizePool: "250.5",
  startDelay: "In 10 minutes",
  duration: "1 day",
  maxParticipants: "30",
  split: "Top 3",
};

describe("buildConfig", () => {
  test("a logo link goes into the metadata, a bad one is refused", () => {
    const withLogo = buildConfig({ ...FORM, image: " https://cdn.example.com/logo.png " }, 1_000n);
    expect(withLogo.ok && tournamentMeta(1n, withLogo.config.metadataURI).image).toBe(
      "https://cdn.example.com/logo.png",
    );
    expect(
      buildConfig({ ...FORM, image: "http://cdn.example.com/logo.png" }, 1_000n),
    ).toMatchObject({
      ok: false,
      field: "image",
    });
    const plain = buildConfig(FORM, 1_000n);
    expect(plain.ok && plain.config.metadataURI.includes("image")).toBe(false);
  });

  test("a private tournament says so in its metadata, a public one stays terse", () => {
    const pub = buildConfig(FORM, 1_000n);
    const priv = buildConfig({ ...FORM, visibility: "private" }, 1_000n);
    expect(pub.ok && isPrivate(pub.config.metadataURI)).toBe(false);
    expect(priv.ok && isPrivate(priv.config.metadataURI)).toBe(true);
    expect(priv.ok && tournamentName(1n, priv.config.metadataURI)).toBe("Jogja Cup 🏆");
  });

  test("a futures tournament names the perps venue and asks for no capital", () => {
    const result = buildConfig({ ...FORM, venue: "futures" }, 1_000n);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.venue).toBe("0x97167B3126E2dEE1FE8920C129bD118Eb91e9881");
      expect(result.config.capitalToken).toBe("0x0000000000000000000000000000000000000000");
      expect(result.config.startingCapital).toBe(0n);
      // The prize is real either way.
      expect(result.config.prizePool).toBe(250_500_000n);
    }
  });

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

describe("buildMetadata", () => {
  test("keeps the visibility it is given so an edit cannot leak a private tournament", () => {
    const built = buildMetadata({ name: " Renamed ", visibility: "private", image: "" });
    expect(built).toEqual({
      ok: true,
      metadataURI: `data:application/json,${encodeURIComponent('{"name":"Renamed","visibility":"private"}')}`,
    });
    expect(buildMetadata({ name: "  ", visibility: "public", image: "" })).toMatchObject({
      field: "name",
    });
  });
});

describe("rematch", () => {
  test("numbers the next game", () => {
    expect(nextName("Game Night")).toBe("Game Night #2");
    expect(nextName("Game Night #2")).toBe("Game Night #3");
    expect(nextName("Cup #9 finals")).toBe("Cup #9 finals #2");
  });

  test("fills the form from the tournament that was played", () => {
    const meta = buildMetadata({
      name: "Jogja Futures #4",
      visibility: "private",
      image: "https://x.test/a.png",
    });
    if (!meta.ok) {
      throw new Error("metadata");
    }
    const form = rematchForm({
      id: 7n,
      venue: "0x97167B3126E2dEE1FE8920C129bD118Eb91e9881",
      metadataURI: meta.metadataURI,
      prizePool: 250_000_000n,
      prizeSplitBps: [10_000],
      startTime: 1_000n,
      // Four minutes after a Start now: closest to the five-minute option.
      endTime: 1_240n,
      maxParticipants: 30,
    });
    expect(form).toEqual({
      venue: "futures",
      visibility: "private",
      image: "https://x.test/a.png",
      name: "Jogja Futures #5",
      prizePool: "250",
      startDelay: "In 10 minutes",
      duration: "5 minutes",
      maxParticipants: "30",
      split: "Winner takes all",
    });
  });
});
