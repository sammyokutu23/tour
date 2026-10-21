import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "travel-password-123";
const stamp = Date.now();

function dateIn(days: number) {
  const d = new Date(Date.now() + 3 * 3_600_000);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function register(browser: Browser, name: string, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/register");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
  return page;
}

async function completeProfile(page: Page, bio: string) {
  await page.goto("/travel-together/profile");
  await page.getByLabel("About you").fill(bio);
  await page.getByText("Hiking & adventure", { exact: true }).click();
  await page.getByLabel(/I confirm I am 18 or older/).check();
  await page.getByLabel(/community guidelines/).check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Travel profile saved.")).toBeVisible();
}

test.describe.serial("Travel Together", () => {
  let organizer: Page;
  let member: Page;
  let groupUrl = "";
  const start = dateIn(12);
  const groupName = `Hell's Gate adventure crew ${stamp}`;

  test("a visitor can browse public groups", async ({ page }) => {
    await page.goto("/travel-together");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Explore together");
    await expect(page.getByText("Diani beach & snorkel weekend (demo)").first()).toBeVisible();
    await page.getByText("Diani beach & snorkel weekend (demo)").first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Diani beach");
    await expect(page.getByRole("link", { name: "Sign in to join" })).toBeVisible();
  });

  test("an organizer creates and publishes an approval-required group", async ({ browser }) => {
    organizer = await register(browser, "Olivia Organizer", `org-${stamp}@example.test`);
    await completeProfile(organizer, "I organise relaxed adventure weekends.");
    await organizer.goto("/travel-together/create");
    await organizer.locator("#name").fill(groupName);
    await organizer.locator("#description").fill("Cycling and gorge walks at Hell's Gate with a small, friendly group.");
    await organizer.locator("#destinationId").selectOption({ label: "Hell's Gate National Park (Rift Valley)" });
    await organizer.locator("#startDate").fill(start);
    await organizer.locator("#endDate").fill(dateIn(13));
    await organizer.locator("#maxMembers").fill("4");
    await organizer.getByText("Request to join", { exact: true }).click();
    await organizer.getByRole("button", { name: /Next: Interests/ }).click();
    // Pre-filled from the travel profile; make sure it's ticked rather than toggling it.
    await organizer.locator('input[name="interests"][value="adventure"]').check({ force: true });
    await organizer.getByRole("button", { name: /Next: Budget/ }).click();
    await organizer.getByLabel("Minimum per person (KES)").fill("5000");
    await organizer.getByLabel("Maximum per person (KES)").fill("15000");
    await organizer.getByRole("button", { name: /Next: Group rules/ }).click();
    await organizer.getByRole("button", { name: /Next: Preview/ }).click();
    await expect(organizer.getByText(groupName).last()).toBeVisible();
    await organizer.getByLabel(/I agree to the community guidelines/).check();
    await organizer.getByRole("button", { name: "Publish group" }).click();
    await organizer.waitForURL(/\/travel-together\/[0-9a-f-]{36}\?created=publish/);
    await expect(organizer.getByText("Your group is live")).toBeVisible();
    groupUrl = new URL(organizer.url()).pathname;
  });

  test("another traveller finds the group and requests to join", async ({ browser }) => {
    member = await register(browser, "Mosi Member", `member-${stamp}@example.test`);
    await member.goto(groupUrl);
    await expect(member.getByText(/confirm you're 18\+/i)).toBeVisible();
    await completeProfile(member, "Keen cyclist, happy to share rides.");
    await member.goto(`/travel-together?destination=hells-gate&interest=adventure#find`);
    await member.getByText(groupName).first().click();
    await expect(member.getByText("2 places left").or(member.getByText("3 places left")).first()).toBeVisible();
    await member.getByLabel(/Message to the organizer/).fill("Hi! I cycle most weekends.");
    await member.getByRole("button", { name: "Request to join" }).click();
    await expect(member.getByText("Request sent. The organizer will review it.").or(member.getByText("Request sent — waiting for the organizer."))).toBeVisible();
  });

  test("the organizer approves the request and capacity updates", async () => {
    await organizer.goto("/travel-together/requests");
    await expect(organizer.getByText("I cycle most weekends.")).toBeVisible();
    await organizer.getByRole("button", { name: "Approve" }).first().click();
    await expect(organizer.getByText("No pending requests")).toBeVisible();
    await organizer.goto(groupUrl);
    await expect(organizer.getByText("2 of 4 going")).toBeVisible();
  });

  test("members propose, vote and see the activity agreed in the shared itinerary", async () => {
    await member.goto(`${groupUrl}/itinerary`);
    await member.getByLabel("Experience and time").selectOption({ index: 0 });
    await member.getByRole("button", { name: "Propose to the group" }).click();
    await expect(member.getByText("Open for voting").first()).toBeVisible();
    await expect(member.getByText("1 yes").first()).toBeVisible();

    await organizer.goto(`${groupUrl}/itinerary`);
    await organizer.getByRole("button", { name: "Vote yes" }).first().click();
    await expect(organizer.getByText("Agreed", { exact: true }).first()).toBeVisible();
    await expect(organizer.getByText("Not booked yet").first()).toBeVisible();
  });

  test("a member books their own place through the normal booking engine", async () => {
    await member.goto(`${groupUrl}/itinerary`);
    await member.getByRole("button", { name: "Book my place" }).first().click();
    await member.waitForURL(/\/studio\/[0-9a-f-]{36}$/);
    await member.getByRole("button", { name: "Get a confirmed quote" }).click();
    await member.getByRole("button", { name: "Request booking" }).click();
    await member.waitForURL(/\/dashboard\/bookings\//);
    await expect(member.getByText("Request sent")).toBeVisible();
    await member.goto(`${groupUrl}/itinerary`);
    await expect(member.getByText(/Your booking: pending provider/)).toBeVisible();
  });

  test("group chat is members-only", async ({ browser }) => {
    await member.goto(`${groupUrl}/chat`);
    await member.getByLabel("Message").fill("Hello crew! Shall we meet at Elsa Gate at 07:45?");
    await member.getByRole("button", { name: "Send" }).click();
    await expect(member.getByText("Shall we meet at Elsa Gate")).toBeVisible();
    await organizer.goto(`${groupUrl}/chat`);
    await expect(organizer.getByText("Shall we meet at Elsa Gate")).toBeVisible();

    const outsider = await register(browser, "Owen Outsider", `out-${stamp}@example.test`);
    await outsider.goto(`${groupUrl}/chat`);
    await expect(outsider.getByText("Off the map")).toBeVisible();
    await outsider.context().close();
  });

  test("a member reports a safety concern and an admin resolves it", async ({ browser }) => {
    await member.goto(groupUrl);
    await member.getByText("Report this group").click();
    await member.getByLabel("Details").fill("Testing the report flow end to end.");
    await member.getByRole("button", { name: "Send report" }).click();
    await expect(member.getByText(/Our safety team will review this privately/)).toBeVisible();

    const admin = await (await browser.newContext()).newPage();
    await admin.goto("/login");
    await admin.getByLabel("Email").fill("admin@demo.test");
    await admin.getByLabel("Password").fill("demo-password-123");
    await admin.getByRole("button", { name: "Sign in" }).click();
    await admin.waitForURL("**/dashboard");
    await admin.goto("/admin/travel-together");
    await admin.getByRole("link", { name: groupName }).first().click();
    await expect(admin.getByText("Testing the report flow end to end.")).toBeVisible();
    await admin.getByLabel("Status").selectOption("resolved");
    await admin.getByLabel("Outcome (recorded)").fill("Test report, no action needed.");
    await admin.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByText("Report updated.")).toBeVisible();
    await admin.context().close();
  });

  test("a member can leave and loses access", async () => {
    await member.goto(groupUrl);
    await member.getByRole("button", { name: "Leave group" }).click();
    await member.getByRole("button", { name: "Yes" }).click();
    await member.waitForURL(/my-groups\?left=1/);
    await member.goto(`${groupUrl}/itinerary`);
    await expect(member.getByText("Off the map")).toBeVisible();
  });
});
