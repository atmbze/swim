import { expect, test } from "@playwright/test";

test("missing listing and unknown route return HTTP 404", async ({ page }) => {
  expect((await page.goto("/listings/999999"))!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
  expect((await page.goto("/no-such-page"))!.status()).toBe(404);
  expect((await page.goto("/sellers/999999"))!.status()).toBe(404);
  expect((await page.goto("/"))!.status()).toBe(200);
});

const cachedPaths = (page: import("@playwright/test").Page) => page.evaluate(async () => {
  const out: string[] = [];
  for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
  return out;
});

test("service worker never caches account pages and logout clears its caches", async ({ page }) => {
  await page.goto("/login");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByLabel("Email").fill("buyer@swim.test");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("link", { name: "Orders" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto("/orders");
  await page.goto("/profile");
  await page.goto("/");
  await expect.poll(() => cachedPaths(page)).toContain("/");
  const before = await cachedPaths(page);
  expect(before).not.toContain("/orders");
  expect(before).not.toContain("/profile");
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  const after = await cachedPaths(page);
  expect(after.filter((p) => p === "/" || p === "/orders")).toEqual([]);
});
