import { mkdirSync } from "node:fs";

import { chromium } from "playwright-core";

/** Where the app runs. The dev server picks the next free port when 3000 is taken, so it is configurable. */
export const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";
export const SHOTS = new URL("./shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const NOISE = /Download the React DevTools|\[HMR\]|Fast Refresh|Failed to load resource/;

/**
 * A phone-sized headless Chrome signed in with the seeded identity (`NEXT_PUBLIC_E2E_PRF_SEED`), opted in for
 * this browser only. Console warnings and errors are collected so every script can assert there were none.
 */
export async function open(path = "/", { signIn = true } = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    localStorage.setItem("yotrade.e2e", "1");
    localStorage.setItem("yotrade.seen", "1");
  });
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type()) && !NOISE.test(m.text())) {
      logs.push(m.text().slice(0, 200));
    }
  });
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message.slice(0, 200)}`));
  await page.goto(`${BASE_URL}${path}`);
  if (signIn) {
    const button = page.getByRole("button", {
      name: /I already have a passkey|Sign in with passkey/,
    });
    await button.waitFor({ timeout: 90_000 });
    await button.click();
  }
  return { browser, page, logs, shot: (name) => page.screenshot({ path: `${SHOTS}${name}.png` }) };
}

/** Prints the outcome and fails the process when a check did not hold, so a CI job or a person sees it. */
export function finish(result, failures = []) {
  console.info(JSON.stringify(result));
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.join("; ")}`);
    process.exit(1);
  }
}

export const check = (failures, condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

/** Mark elapsed seconds since `start`, for the timings quoted in the README. */
export const since = (start) => `${((Date.now() - start) / 1000).toFixed(0)}s`;
