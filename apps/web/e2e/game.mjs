import { BASE_URL, check, finish, open, since } from "./lib.mjs";

/**
 * The game-show loop in one identity: host a futures game an hour out, open it by its code from Home, see the
 * lobby, join with a name, press Start now, and land in a live game with the trade button. Three transactions.
 */
const failures = [];
const start = Date.now();
const out = {};
const { browser, page, logs, shot } = await open("/new");
try {
  await page.getByRole("button", { name: "Futures", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Game Night");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Prize pool in USDC").fill("0");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Starts").selectOption("In 1 hour");
  await page.getByRole("button", { name: "Create tournament" }).click();
  await page.waitForURL(/\/t\/\d+$/, { timeout: 180_000 });
  const path = new URL(page.url()).pathname;
  out.created = since(start);

  // The code on the hero is what a player types on Home.
  const code = (
    await page.getByRole("button", { name: /^Game code/ }).getAttribute("aria-label")
  ).match(/Game code (\w{6})/)[1];
  out.code = code;
  await page.goto(`${BASE_URL}/`);
  await page.getByLabel("Game code").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await page.waitForURL(new RegExp(`${path}$`), { timeout: 60_000 });
  await page.getByText("Starts in").waitFor({ timeout: 60_000 });
  check(
    failures,
    (await page.getByText(/Nobody yet/).count()) === 1,
    "lobby is not empty before anyone joined",
  );

  const name = page.getByLabel("Your name on the board");
  if (await name.count()) {
    await name.fill("Game Host");
  }
  await page.getByRole("button", { name: /^Join/ }).click();
  await page
    .getByText(/You.re in/)
    .first()
    .waitFor({ timeout: 120_000 });
  out.joined = since(start);
  await shot("game-lobby");

  await page.getByRole("button", { name: "Start now", exact: true }).click();
  await page.getByText("LIVE", { exact: false }).first().waitFor({ timeout: 120_000 });
  await page.getByRole("link", { name: "Trade" }).waitFor({ timeout: 60_000 });
  out.started = since(start);
  await shot("game-live");
  out.tournament = path;
} catch (error) {
  failures.push(String(error).slice(0, 300));
  await shot("game-failed");
}
check(failures, logs.length === 0, `console: ${logs[0] ?? ""}`);
await browser.close();
finish(out, failures);
