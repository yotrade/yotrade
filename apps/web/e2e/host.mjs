import { check, finish, open } from "./lib.mjs";

/**
 * The host card offers cancel before the start and nothing else: the organizer creates a free tournament,
 * sees the offer, backs out once, then confirms and watches the badge flip. Two transactions.
 */
const failures = [];
const { browser, page, logs, shot } = await open("/new");
await page.getByRole("button", { name: "Futures", exact: true }).click();
await page.getByLabel("Name", { exact: true }).fill("Host Cup");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel("Prize pool in USDC").fill("0");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel("Starts").selectOption("In 1 hour");
await page.getByRole("button", { name: "Create tournament" }).click();
await page.waitForURL(/\/t\/\d+$/, { timeout: 180_000 });
const offer = page.getByRole("button", { name: "Cancel tournament" });
await offer.waitFor({ timeout: 60_000 });
await offer.click();
await page.getByRole("button", { name: "Keep it" }).click();
check(failures, (await offer.count()) === 1, "backing out did not restore the offer");
await offer.click();
await shot("host-confirm");
await page.getByRole("button", { name: "Yes, cancel" }).click();
await page.getByText("Cancelled", { exact: true }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(1_000);
check(failures, (await offer.count()) === 0, "offer survives the cancel");
await shot("host-cancelled");
check(failures, logs.length === 0, `console: ${logs[0] ?? ""}`);
await browser.close();
finish({ tournament: new URL(page.url()).pathname }, failures);
