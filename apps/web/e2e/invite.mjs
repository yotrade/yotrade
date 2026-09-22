import { BASE_URL, check, finish, open } from "./lib.mjs";

/**
 * A private tournament: the host creates it and lands on the invite link, the same identity then proves that
 * the arena hides it, that the page without the code refuses, that a wrong pasted code is refused, and that
 * the pasted code admits. Two transactions.
 */
const failures = [];
const host = await open("/new");
await host.page.getByRole("button", { name: "Private", exact: true }).click();
await host.page.getByRole("button", { name: "Futures", exact: true }).click();
await host.page.getByLabel("Name", { exact: true }).fill("Invite Cup");
await host.page.getByRole("button", { name: "Continue" }).click();
await host.page.getByLabel("Prize pool in USDC").fill("0");
await host.page.getByRole("button", { name: "Continue" }).click();
await host.page.getByLabel("Starts").selectOption("In 1 hour");
await host.page.getByRole("button", { name: "Create tournament" }).click();
await host.page.waitForURL(/\/t\/\d+#invite=0x[0-9a-f]{64}$/, { timeout: 180_000 });
const link = new URL(host.page.url());
await host.page.getByText("Private · invite link").waitFor({ timeout: 60_000 });
await host.shot("invite-host");
check(failures, host.logs.length === 0, `host console: ${host.logs[0] ?? ""}`);
await host.browser.close();

const guest = await open(`${link.pathname}`);
await guest.page.getByText("This tournament is private").waitFor({ timeout: 60_000 });
check(
  failures,
  (await guest.page.getByRole("button", { name: /^Join/ }).count()) === 0,
  "join offered without the code",
);
await guest.page.goto(`${BASE_URL}/arena`);
await guest.page.getByRole("tab", { name: "Upcoming" }).click({ timeout: 60_000 });
await guest.page.waitForTimeout(3_000);
check(
  failures,
  (await guest.page.getByText("Invite Cup").count()) === 0,
  "arena lists the private tournament",
);
// The code on its own, as a chat app that strips fragments would leave it.
await guest.page.goto(`${BASE_URL}${link.pathname}`);
await guest.page.getByLabel("Invite code").fill("0x1234");
await guest.page.getByRole("button", { name: "Use code" }).click();
check(
  failures,
  (await guest.page.getByText("That is not an invite code", { exact: false }).count()) === 1,
  "a bad code was accepted",
);
await guest.page
  .getByLabel("Invite code")
  .fill(new URLSearchParams(link.hash.slice(1)).get("invite"));
await guest.page.getByRole("button", { name: "Use code" }).click();
await guest.page.getByRole("button", { name: /^Join/ }).click({ timeout: 60_000 });
await guest.page.getByText("You're in").waitFor({ timeout: 120_000 });
await guest.shot("invite-joined");
check(failures, guest.logs.length === 0, `guest console: ${guest.logs[0] ?? ""}`);
await guest.browser.close();
finish({ tournament: link.pathname }, failures);
