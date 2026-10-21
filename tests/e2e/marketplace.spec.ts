import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "demo-password-123";

/** First date ≥ 10 days out that isn't a Saturday (the demo guide's day off), in Nairobi time. */
function tripStart(): string {
  const d = new Date(Date.now() + 3 * 3_600_000); // shift to EAT
  d.setUTCDate(d.getUTCDate() + 10);
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function login(browser: Browser, email: string, password = PASSWORD): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

test.describe.serial("traveller → provider → payment → cancellation", () => {
  const email = `e2e-${Date.now()}@example.test`;
  let traveller: Page;
  let bookingUrl = "";
  const start = tripStart();

  test("1. visitor browses destinations and experiences", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("a guide you chose");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Destinations" }).click();
    await expect(page.getByRole("heading", { name: "Where in Kenya?" })).toBeVisible();
    await page.getByRole("heading", { name: "Lake Naivasha", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Lake Naivasha" })).toBeVisible();
    await page.goto("/experiences?category=beach-marine");
    await expect(page.getByText("Marine park snorkelling trip")).toBeVisible();
    await expect(page.getByText("Demo listing").first()).toBeVisible();
  });

  test("2. traveller creates an account", async ({ browser }) => {
    traveller = await (await browser.newContext()).newPage();
    await traveller.goto("/register");
    await traveller.getByLabel("Full name").fill("E2E Traveller");
    await traveller.getByLabel("Email").fill(email);
    await traveller.getByLabel("Password").fill("e2e-password-12345");
    await traveller.getByLabel(/I agree to the/).check();
    await traveller.getByRole("button", { name: "Create account" }).click();
    await traveller.waitForURL("**/dashboard");
    await expect(traveller.getByRole("heading", { name: "Your journeys" })).toBeVisible();
  });

  test("3–4. traveller creates an itinerary, adds an experience and selects a guide", async () => {
    await traveller.goto("/studio/new?destination=lake-naivasha");
    await traveller.getByLabel("Trip name").fill("E2E Rift Valley");
    await traveller.getByLabel("Arrival").fill(start);
    await traveller.getByLabel("Departure").fill(start);
    await traveller.getByRole("button", { name: "Create trip & open planner" }).click();
    await traveller.waitForURL(/\/studio\/[0-9a-f-]{36}$/);
    await expect(traveller.getByText("Drafts are not bookings")).toBeVisible();

    const catalogue = traveller.locator("#catalogue");
    await catalogue.getByText("Lake Naivasha boat ride").first().click();
    await catalogue.getByRole("button", { name: /Day 1 · 08:00/ }).first().click();
    await expect(traveller.locator("#timeline").getByText("Lake Naivasha boat ride")).toBeVisible();

    await catalogue.getByRole("link", { name: "guides" }).click();
    const service = catalogue.locator("div.rounded-xl", { hasText: "Full-day private guiding" }).first();
    await service.getByRole("button", { name: "Add" }).click();
    await expect(traveller.locator("#timeline").getByText(/Achieng O\.: Full-day private guiding/)).toBeVisible();
    await expect(traveller.getByText("Estimated total")).toBeVisible();
  });

  test("5. traveller gets a quote and submits a booking request", async () => {
    await traveller.getByRole("button", { name: "Get a confirmed quote" }).click();
    await expect(traveller.getByRole("button", { name: "Request booking" })).toBeVisible();
    await traveller.getByRole("button", { name: "Request booking" }).click();
    await traveller.waitForURL(/\/dashboard\/bookings\/[0-9a-f-]{36}/);
    await expect(traveller.getByText("Request sent")).toBeVisible();
    await expect(traveller.getByText("Awaiting provider").first()).toBeVisible();
    bookingUrl = new URL(traveller.url()).pathname;
  });

  test("6. providers accept the request", async ({ browser }) => {
    const id = bookingUrl.split("/").pop();
    for (const providerEmail of ["guide.achieng@demo.test", "operator.highlands@demo.test"]) {
      const p = await login(browser, providerEmail);
      await p.goto(`/provider/bookings/${id}`);
      await p.getByRole("button", { name: "Accept booking" }).click();
      await expect(p.getByText(/You've accepted|accepted\. The booking is confirmed once/)).toBeVisible();
      await p.context().close();
    }
  });

  test("7–8. sandbox payment succeeds and the booking is confirmed", async () => {
    await traveller.goto(bookingUrl);
    await expect(traveller.getByText("Awaiting payment").first()).toBeVisible();
    await traveller.getByRole("button", { name: "Continue to payment" }).click();
    await traveller.waitForURL(/\/checkout\/sandbox\//);
    await expect(traveller.getByText("Test mode — no real money is moved.")).toBeVisible();
    await traveller.getByRole("button", { name: "Approve test payment" }).click();
    await traveller.waitForURL(/payment=succeeded/);
    await expect(traveller.getByText("Payment verified — you're booked!")).toBeVisible();
    await expect(traveller.getByText("Confirmed", { exact: true }).first()).toBeVisible();
    await expect(traveller.getByText("Paid", { exact: true }).first()).toBeVisible();
  });

  test("9. traveller views the confirmed itinerary", async () => {
    await traveller.getByRole("link", { name: "View itinerary" }).click();
    await expect(traveller.getByText("Itinerary locked")).toBeVisible();
    await expect(traveller.getByText("Confirmed").first()).toBeVisible();
  });

  test("10. provider sees the assigned booking without traveller contact details", async ({ browser }) => {
    const p = await login(browser, "guide.achieng@demo.test");
    await p.goto(bookingUrl.replace("/dashboard/", "/provider/"));
    await expect(p.getByRole("heading", { name: "Booking for E2E" })).toBeVisible();
    await expect(p.getByText(email)).toHaveCount(0);
    await expect(p.getByText("Lake Naivasha boat ride")).toHaveCount(0); // operator's item is not shown to the guide
    await p.context().close();
  });

  test("11. traveller requests a change", async () => {
    await traveller.goto(bookingUrl);
    await traveller.getByLabel("Request a change").fill("Could we start the boat ride an hour later?");
    await traveller.getByRole("button", { name: "Send request" }).click();
    await expect(traveller.getByText("Could we start the boat ride an hour later?")).toBeVisible();
    await expect(traveller.getByText("open", { exact: true })).toBeVisible();
  });

  test("13. another traveller cannot open this booking", async ({ browser }) => {
    const other = await login(browser, "traveller@demo.test");
    // Streaming responses may already have sent a 200 shell; the not-found UI is what matters.
    await other.goto(bookingUrl);
    await expect(other.getByText("Off the map")).toBeVisible();
    await other.context().close();
  });

  test("12. cancellation refunds according to policy", async () => {
    await traveller.goto(bookingUrl);
    await traveller.getByLabel("Reason").fill("Plans changed");
    await traveller.getByLabel(/I understand this cancels/).check();
    await traveller.getByRole("button", { name: "Cancel booking" }).click();
    await expect(traveller.getByText("Refund · succeeded")).toBeVisible();
    await expect(traveller.getByText("Cancelled", { exact: true }).first()).toBeVisible();
    await expect(traveller.getByText("Refunded", { exact: true }).first()).toBeVisible();
  });
});

test("14. concurrent requests cannot double-book the same guide", async ({ browser }) => {
  // Two travellers plan the same guide at the same time on the same day, then request together.
  const start = tripStart();
  const pages: Page[] = [];
  for (let i = 0; i < 2; i++) {
    const page = await (await browser.newContext()).newPage();
    await page.goto("/register");
    await page.getByLabel("Full name").fill(`Racer ${i}`);
    await page.getByLabel("Email").fill(`racer-${i}-${Date.now()}@example.test`);
    await page.getByLabel("Password").fill("race-password-123");
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/dashboard");
    await page.goto("/studio/new?destination=nairobi");
    // A different week from the serial test to avoid interference.
    const d = new Date(`${start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    if (d.getUTCDay() === 6 || d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 2);
    const date = d.toISOString().slice(0, 10);
    await page.getByLabel("Arrival").fill(date);
    await page.getByLabel("Departure").fill(date);
    await page.getByRole("button", { name: "Create trip & open planner" }).click();
    await page.waitForURL(/\/studio\/[0-9a-f-]{36}$/);
    await page.locator("#catalogue").getByRole("link", { name: "guides" }).click();
    const service = page.locator("#catalogue div.rounded-xl", { hasText: "Nairobi city day" }).first();
    await service.getByRole("button", { name: "Add" }).click();
    await expect(page.locator("#timeline").getByText(/Njeri W\.: Nairobi city day/)).toBeVisible();
    await page.getByRole("button", { name: "Get a confirmed quote" }).click();
    await expect(page.getByRole("button", { name: "Request booking" })).toBeVisible();
    pages.push(page);
  }
  await Promise.all(pages.map((p) => p.getByRole("button", { name: "Request booking" }).click()));
  const conflict = /just booked|Availability changed|not available/;
  await Promise.all(
    pages.map((p) => Promise.race([p.waitForURL(/\/dashboard\/bookings\//), p.getByText(conflict).first().waitFor()])),
  );
  const succeeded = pages.filter((p) => /\/dashboard\/bookings\//.test(p.url())).length;
  expect(succeeded).toBe(1);
  const loser = pages.find((p) => /\/studio\//.test(p.url()))!;
  await expect(loser.getByText(conflict).first()).toBeVisible();
});
