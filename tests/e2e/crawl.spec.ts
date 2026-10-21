import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Smoke crawl: follows same-origin links (GET only — nothing is submitted) from each role's
 * starting pages and records console errors, uncaught exceptions, HTTP errors and error screens.
 */

const PASSWORD = "demo-password-123";
const SKIP = [/^\/api\//, /^\/documents\//, /^\/_next\//, /^\/dev\//, /\.(png|jpg|svg|xml|txt|ico)$/];
const MAX_PAGES = 90;

interface Problem {
  role: string;
  url: string;
  kind: string;
  detail: string;
}

async function newPage(browser: Browser, role: string, email?: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (email) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/dashboard");
  }
  void role;
  return page;
}

async function crawl(page: Page, role: string, seeds: string[], problems: Problem[]) {
  const origin = new URL(page.url() === "about:blank" ? "http://localhost:3100" : page.url()).origin;
  const queue = [...seeds];
  const seen = new Set<string>();
  const perPattern = new Map<string, number>();
  // Visit each route shape (e.g. /experiences/:slug) at most twice so the budget covers every page type.
  const pattern = (p: string) =>
    p
      .split("?")[0]
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id")
      .replace(/^\/(experiences|destinations|guides|journeys)\/[^/]+$/, "/$1/:slug")
      .replace(/^\/travel-together\/invite\/[^/]+$/, "/travel-together/invite/:token");
  let current = "";

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Map tile fetches are third-party and network-dependent.
    if (/tile\.openstreetmap|Failed to load resource.*openstreetmap/i.test(text)) return;
    problems.push({ role, url: current, kind: "console", detail: text.slice(0, 300) });
  });
  page.on("pageerror", (err) => problems.push({ role, url: current, kind: "exception", detail: err.message.slice(0, 300) }));
  page.on("response", (res) => {
    const u = new URL(res.url());
    if (u.origin !== origin || res.status() < 400) return;
    problems.push({ role, url: current, kind: `http ${res.status()}`, detail: u.pathname });
  });

  while (queue.length && seen.size < MAX_PAGES) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    const key = pattern(path) + (path.includes("?") ? "?" : "");
    if ((perPattern.get(key) ?? 0) >= 2) continue;
    perPattern.set(key, (perPattern.get(key) ?? 0) + 1);
    seen.add(path);
    current = path;
    await page.goto(path, { waitUntil: "networkidle" });
    const body = (await page.locator("main").innerText().catch(() => "")) ?? "";
    if (/Something went wrong/.test(body)) problems.push({ role, url: path, kind: "error screen", detail: "error boundary shown" });
    if (/Off the map/.test(body)) problems.push({ role, url: path, kind: "not found", detail: "404 page shown" });

    const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
    for (const h of hrefs) {
      if (!h || !h.startsWith("/") || h.startsWith("//")) continue;
      const clean = h.split("#")[0];
      if (!clean || SKIP.some((r) => r.test(clean)) || seen.has(clean)) continue;
      // Avoid exploding through every pagination/filter combination.
      if (/[?&](page|sort|tab|q|cat|dest)=/.test(clean) && queue.filter((q) => q.split("?")[0] === clean.split("?")[0]).length > 1) continue;
      queue.push(clean);
    }
  }
  covered[role] = [...perPattern.keys()];
  return seen.size;
}

const covered: Record<string, string[]> = {};

test("crawl every reachable page as each role without errors", async ({ browser }) => {
  test.setTimeout(600_000);
  const problems: Problem[] = [];
  const roles: { role: string; email?: string; seeds: string[] }[] = [
    { role: "visitor", seeds: ["/", "/destinations", "/experiences", "/guides", "/journeys", "/studio", "/studio/new", "/how-it-works", "/about", "/safety", "/faq", "/contact", "/login", "/register", "/forgot-password", "/legal/terms", "/legal/privacy", "/legal/cancellation", "/travel-together", "/travel-together/guidelines"] },
    { role: "traveller", email: "traveller@demo.test", seeds: ["/dashboard", "/dashboard/trips", "/dashboard/bookings", "/dashboard/messages", "/dashboard/notifications", "/dashboard/saved", "/dashboard/support", "/dashboard/settings", "/studio", "/studio/new", "/travel-together", "/travel-together/my-groups", "/travel-together/requests", "/travel-together/messages", "/travel-together/profile", "/travel-together/create"] },
    { role: "guide", email: "guide.achieng@demo.test", seeds: ["/provider", "/provider/profile", "/provider/services", "/provider/listings", "/provider/availability", "/provider/bookings", "/provider/messages", "/provider/earnings", "/provider/reviews"] },
    { role: "operator", email: "operator.highlands@demo.test", seeds: ["/provider", "/provider/listings", "/provider/listings/new", "/provider/bookings", "/provider/earnings"] },
    { role: "admin", email: "admin@demo.test", seeds: ["/admin", "/admin/providers", "/admin/listings", "/admin/bookings", "/admin/payments", "/admin/refunds", "/admin/payouts", "/admin/support", "/admin/reviews", "/admin/users", "/admin/destinations", "/admin/destinations/new", "/admin/settings", "/admin/notifications", "/admin/audit", "/admin/travel-together", "/admin/travel-together/groups"] },
  ];
  const visited: Record<string, number> = {};
  for (const r of roles) {
    const page = await newPage(browser, r.role, r.email);
    visited[r.role] = await crawl(page, r.role, r.seeds, problems);
    await page.context().close();
  }
  console.log("Pages visited per role:", visited);
  console.log("Route shapes covered:", [...new Set(Object.values(covered).flat())].sort().join("  "));
  const unique = [...new Map(problems.map((p) => [`${p.kind}|${p.detail}|${p.url}`, p])).values()];
  if (unique.length) console.log(JSON.stringify(unique, null, 2));
  expect(unique, "problems found while crawling").toEqual([]);
});
