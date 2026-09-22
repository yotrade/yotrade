import { check, finish, open } from "./lib.mjs";

/** The three-step create flow validates each step and lets the host go back. No transaction is sent. */
const { browser, page, logs, shot } = await open("/new");
const failures = [];
await page.getByRole("button", { name: "Continue" }).click();
check(
  failures,
  (await page.getByText("Give your tournament a name").count()) === 1,
  "empty name accepted",
);
await page.getByLabel("Name", { exact: true }).fill("Flow Cup");
await page.getByRole("button", { name: "Private", exact: true }).click();
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel("Prize pool in USDC").fill("abc");
await page.getByRole("button", { name: "Continue" }).click();
check(
  failures,
  (await page.getByText("Enter an amount in USDC, or 0").count()) === 1,
  "bad prize accepted",
);
await page.getByLabel("Prize pool in USDC").fill("0");
await page.getByRole("button", { name: "Continue" }).click();
await shot("create-review");
check(
  failures,
  (await page.getByText("Invite link only").count()) === 1,
  "review misses visibility",
);
await page.getByRole("button", { name: "Previous step" }).click();
check(
  failures,
  (await page.getByLabel("Prize pool in USDC").count()) === 1,
  "back did not return to the prize",
);
check(failures, logs.length === 0, `console: ${logs[0] ?? ""}`);
await browser.close();
finish({ ok: failures.length === 0 }, failures);
