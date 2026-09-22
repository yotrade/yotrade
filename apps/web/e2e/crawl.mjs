import { BASE_URL, check, finish, open } from "./lib.mjs";

/**
 * Visits every route and reports what a person would notice: console output, controls without a name,
 * inputs without a label, horizontal overflow, regions still loading after six seconds, missing headings.
 * `E2E_TOURNAMENT` names a tournament to open (default 1); the unknown id and slug routes are always included.
 */
const T = process.env["E2E_TOURNAMENT"] ?? "1";
const ROUTES = [
  "/",
  "/arena",
  "/activity",
  "/account",
  "/account/profile",
  "/new",
  `/t/${T}`,
  `/t/${T}/trade`,
  "/t/999",
  `/t/${T}/trade/nope`,
  "/nope",
];

const { browser, page, logs, shot } = await open("/");
await page.getByRole("link", { name: /Main account|YoTester/ }).waitFor({ timeout: 60_000 });
const failures = [];
const report = [];
for (const [index, route] of ROUTES.entries()) {
  logs.length = 0;
  await page.goto(`${BASE_URL}${route}`);
  // Loading states appear after hydration and clear when their data arrives; a slow RPC must not read as a
  // page stuck loading, so wait until nothing has been busy for a full second, up to half a minute.
  await page.waitForTimeout(2_000);
  for (let quiet = 0, waited = 0; quiet < 2 && waited < 30_000; waited += 500) {
    quiet = (await page.locator('[aria-busy="true"]').count()) === 0 ? quiet + 1 : 0;
    await page.waitForTimeout(500);
  }
  const audit = await page.evaluate(() => {
    const named = (el) =>
      el.getAttribute("aria-label") ||
      el.textContent?.trim() ||
      el.querySelector("img[alt]:not([alt=''])");
    return {
      unnamed: [...document.querySelectorAll("button, a")].filter((el) => !named(el)).length,
      inputs: [...document.querySelectorAll("input, select, textarea")].filter(
        (el) =>
          !(
            (el.id && document.querySelector(`label[for='${el.id}']`)) ||
            el.getAttribute("aria-label") ||
            el.closest("label")
          ),
      ).length,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      busy: document.querySelectorAll('[aria-busy="true"]').length,
      h1: document.querySelectorAll("h1").length,
      title: document.title,
    };
  });
  await shot(`crawl-${String(index).padStart(2, "0")}`);
  report.push({ route, ...audit, logs: [...logs] });
  check(failures, logs.length === 0, `${route}: console ${logs[0] ?? ""}`);
  check(failures, audit.unnamed === 0, `${route}: ${audit.unnamed} unnamed controls`);
  check(failures, audit.inputs === 0, `${route}: ${audit.inputs} unlabeled inputs`);
  check(failures, !audit.overflow, `${route}: horizontal overflow`);
  check(failures, audit.busy === 0, `${route}: still loading`);
  check(failures, audit.h1 === 1, `${route}: ${audit.h1} h1`);
}
await browser.close();
finish(report, failures);
