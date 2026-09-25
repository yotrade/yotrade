import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

/**
 * Counted from the sources at build time, so the page cannot drift from the test runners: a number a
 * reader can tally is a number that has to be right. In dev this module lives in src/, in a build in
 * dist/, so the repository root is found by walking up.
 */
let root = new URL("./", import.meta.url);
while (!existsSync(new URL("packages/contracts/foundry.toml", root))) {
  root = new URL("../", root);
}

function files(dir: string, suffix: string): string[] {
  const base = new URL(dir, root);
  if (!existsSync(base)) {
    return [];
  }
  const walk = (url: URL): string[] =>
    readdirSync(url).flatMap((name) => {
      if (name === "node_modules") {
        return [];
      }
      const child = new URL(name, url);
      if (statSync(child).isDirectory()) {
        return walk(new URL(`${name}/`, url));
      }
      return name.endsWith(suffix) ? [readFileSync(child, "utf8")] : [];
    });
  return walk(base);
}

const count = (sources: string[], pattern: RegExp) =>
  sources.reduce((n, source) => n + (source.match(pattern)?.length ?? 0), 0);

const solidity = files("packages/contracts/test/", ".t.sol");

/** Every `function test…` in the Foundry suites, invariants and fork tests included. */
export const contractTests = count(solidity, /function (test|invariant)\w*\(/g);
/** Every `assert…(` call the contract suites make. */
export const contractAssertions = count(solidity, /\bassert[A-Za-z]*\(/g);
/** The web app's `test(` declarations: scoring, drip, finalize, tickets, and the rest. */
export const webTests = count(files("apps/web/test/", ".test.ts"), /^[ \t]*(it|test)\(/gm);
/** The indexer's handlers, against simulated events. */
export const indexerTests = count(files("apps/indexer/test/", ".test.ts"), /^[ \t]*(it|test)\(/gm);
/** Kuru, Pyth futures, Mera passkeys and the tournament client. */
export const pluginTests = count(files("packages/plugins/", ".test.ts"), /^[ \t]*(it|test)\(/gm);
