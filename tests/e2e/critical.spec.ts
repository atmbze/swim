import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("link", { name: "Orders" })).toBeVisible();
}

test("register, create listing, see it in storefront and search", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Seller");
  await page.getByLabel("Email").fill(`e2e${Date.now()}@swim.test`);
  await page.getByLabel("Password (min 8)").fill("password123");
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("link", { name: "Sell", exact: true })).toBeVisible();
  await page.goto("/listings/new");
  await page.getByLabel("Title").fill("E2E Cactus Planter");
  await page.getByLabel("Description").fill("Ceramic planter");
  await page.getByLabel("Price ($)").fill("15");
  await page.getByLabel("ZIP").fill("85001");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: "E2E Cactus Planter" })).toBeVisible();
  await page.goto("/?q=cactus");
  await expect(page.getByText("E2E Cactus Planter")).toBeVisible();
});

test("buyer orders with Deal Den code, pays (mock), seller ships, buyer confirms", async ({ page, context }) => {
  await login(page, "buyer@swim.test");
  await page.goto("/?q=drill");
  await page.getByText("Cordless Drill 20V").click();
  await expect(page.getByText("MOCK CHECKOUT")).toBeVisible();
  await page.getByLabel("Deal Den code").fill("SAMTOOLS");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page).toHaveURL(/\/orders/);
  const row = page.locator("tr", { hasText: "Cordless Drill 20V" }).first();
  await expect(row).toContainText("$63.99");
  await expect(row).toContainText("pending_payment");
  await row.getByRole("button", { name: "Pay (mock)" }).click();
  await expect(row).toContainText("paid");
  await context.clearCookies();
  await login(page, "seller@swim.test");
  await page.goto("/orders");
  await page.locator("tr", { hasText: "Cordless Drill 20V" }).getByRole("button", { name: "Mark shipped" }).click();
  await expect(page.locator("tr", { hasText: "Cordless Drill 20V" })).toContainText("shipped");
  await context.clearCookies();
  await login(page, "buyer@swim.test");
  await page.goto("/orders");
  await page.locator("tr", { hasText: "Cordless Drill 20V" }).getByRole("button", { name: "Confirm delivery" }).click();
  await expect(page.locator("tr", { hasText: "Cordless Drill 20V" })).toContainText("delivered");
});

test("non-admin is denied admin page and API", async ({ page }) => {
  await login(page, "buyer@swim.test");
  await page.goto("/admin");
  await expect(page.getByText("403 — admins only.")).toBeVisible();
  const r = await page.request.post("/api/admin/users/1", { data: { action: "ban" } });
  expect(r.status()).toBe(403);
});

test("PWA manifest, service worker and offline page are served", async ({ page }) => {
  const m = await page.request.get("/manifest.webmanifest");
  expect((await m.json()).short_name).toBe("SOWESTIM");
  expect((await page.request.get("/sw.js")).ok()).toBe(true);
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: /offline/ })).toBeVisible();
});
