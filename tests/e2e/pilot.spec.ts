import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("link", { name: "Orders" })).toBeVisible();
}

test("missing listing returns 404", async ({ page }) => {
  const res = await page.goto("/listings/999999");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

test("security headers are served", async ({ page }) => {
  const res = await page.goto("/");
  const headers = res?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
});

test("key pages have no serious accessibility violations", async ({ page }) => {
  for (const path of ["/", "/login", "/register", "/buyback"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, `${path}: ${JSON.stringify(serious.map((v) => v.id))}`).toEqual([]);
  }
});

test("service worker serves the offline page when the network drops", async ({ page, context }) => {
  await page.goto("/");
  // Wait until the service worker controls the page.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
  await context.setOffline(true);
  // /buyback was never visited, so it is not in the page cache: expect the offline fallback.
  await page.goto("/buyback");
  await expect(page.getByRole("heading", { name: /offline/ })).toBeVisible();
  await context.setOffline(false);
});

test("logout clears cached pages from the service worker", async ({ page }) => {
  await login(page, "buyer@swim.test");
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20000 });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
  // Wait until the SW has cached the profile page…
  await page.waitForFunction(async () => {
    const c = await caches.open("swim-v1");
    return (await c.keys()).some((k) => new URL(k.url).pathname === "/profile");
  });
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  // …and verify the logout wiped it from the cache.
  await page.waitForFunction(async () => {
    const c = await caches.open("swim-v1");
    return !(await c.keys()).some((k) => new URL(k.url).pathname === "/profile");
  });
});
