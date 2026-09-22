import { check, finish, open } from "./lib.mjs";

/** Saves a name and avatar on the device. Sends one transaction per open tournament the identity is in. */
const { browser, page, logs, shot } = await open("/account/profile");
const failures = [];
await page.getByLabel("Display name").fill("YoTester");
await page.getByRole("button", { name: "Avatar 4" }).click();
await page.getByRole("button", { name: "Save profile" }).click();
const status = page.getByRole("status").filter({ hasText: /Saved/ });
await status.waitFor({ timeout: 120_000 });
await shot("profile-saved");
check(failures, logs.length === 0, `console: ${logs[0] ?? ""}`);
await browser.close();
finish({ status: await status.innerText().catch(() => "") }, failures);
