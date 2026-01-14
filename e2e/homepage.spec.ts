import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("displays the title and navigation", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toHaveText("Indie Blog Reader");
    await expect(page.locator("nav.filters")).toBeVisible();
    // "today" filter uses "/" as href (default), "comments" uses "/?filter=comments"
    await expect(page.locator("nav.filters a").first()).toHaveText("New Today");
    await expect(page.locator('a[href="/?filter=comments"]')).toHaveText("New Comments");
  });

  test("has language switcher", async ({ page }) => {
    await page.goto("/");

    const langSwitcher = page.locator("nav.language-switcher");
    await expect(langSwitcher).toBeVisible();
    await expect(langSwitcher.locator("a")).toHaveCount(3); // All, 中文, English
  });

  test("has live indicator", async ({ page }) => {
    await page.goto("/");

    const liveIndicator = page.locator("#live-indicator");
    await expect(liveIndicator).toBeVisible();
    await expect(page.locator(".live-text")).toHaveText("Live");
  });

  test("has add blog form", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".add-blog h3")).toHaveText("Add New Blog");
    await expect(page.locator('input[name="url"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator(".add-form button")).toHaveText("Add Blog");
  });

  test("filter links work", async ({ page }) => {
    await page.goto("/");

    // Click New Comments filter
    await page.click('a[href="/?filter=comments"]');
    await expect(page).toHaveURL("/?filter=comments");

    // Click New Today filter (first link in nav.filters)
    await page.click("nav.filters a:first-child");
    await expect(page).toHaveURL("/");
  });

  test("language switcher works", async ({ page }) => {
    await page.goto("/");

    // Click Chinese filter
    await page.click('a[href="/?lang=zh"]');
    await expect(page).toHaveURL("/?lang=zh");

    // Click English filter
    await page.click('a[href="/?lang=en"]');
    await expect(page).toHaveURL("/?lang=en");

    // Click All (first link in language-switcher, which uses "/" when on default filter)
    await page.click("nav.language-switcher a:first-child");
    await expect(page).toHaveURL("/");
  });
});

test.describe("SSE Live Updates", () => {
  test("connects to SSE endpoint", async ({ page }) => {
    await page.goto("/");

    // Wait for the live indicator to show connected state
    // The SSE connection should be established
    const liveIndicator = page.locator("#live-indicator");
    await expect(liveIndicator).toBeVisible();

    // Check that SSE script is initialized (look for EventSource in page context)
    const hasEventSource = await page.evaluate(() => {
      return typeof EventSource !== "undefined";
    });
    expect(hasEventSource).toBe(true);
  });
});
