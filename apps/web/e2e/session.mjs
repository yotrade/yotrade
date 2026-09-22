import { check, finish, open } from "./lib.mjs";

/** A reload keeps the session; sign-out ends it; the account page and the profile editor work. */
const { browser, page, logs, shot } = await open("/");
const failures = [];
const chip = page.getByRole("link", { name: /Main account|YoTester/ });
await chip.waitFor({ timeout: 60_000 });
await page.reload();
await chip.waitFor({ timeout: 30_000 });
check(
  failures,
  (await page.getByRole("button", { name: /Sign in with passkey/ }).count()) === 0,
  "reload asked for the passkey",
);
await chip.click();
await page.getByRole("link", { name: "Edit profile" }).click();
await page.getByLabel("Display name").waitFor();
await shot("session-profile");
await page.getByRole("button", { name: "Back" }).click();
await page.getByRole("button", { name: "Sign out" }).click();
await page.getByRole("button", { name: /Sign in with passkey/ }).waitFor({ timeout: 30_000 });
await page.reload();
await page.getByRole("button", { name: /Sign in with passkey/ }).waitFor({ timeout: 30_000 });
check(failures, logs.length === 0, `console: ${logs[0] ?? ""}`);
await browser.close();
finish({ ok: failures.length === 0 }, failures);
