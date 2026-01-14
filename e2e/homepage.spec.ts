import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("displays the title and navigation", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toHaveText("Indie Blog Reader");
    await expect(page.locator("nav.filters")).toBeVisible();
    await expect(page.locator('a[href="/?filter=today"]')).toHaveText("New Today");
    await expect(page.locator('a[href="/?filter=comments"]')).toHaveText("New Comments");
  });

  test("has refresh button", async ({ page }) => {
    await page.goto("/");

    const refreshBtn = page.locator(".refresh-btn");
    await expect(refreshBtn).toBeVisible();
    await expect(refreshBtn).toHaveText("Refresh");
  });

  test("has add blog form", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".add-blog h3")).toHaveText("Add New Blog");
    await expect(page.locator('input[name="url"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator(".add-form button")).toHaveText("Add Blog");
  });

  test("has hidden progress overlay", async ({ page }) => {
    await page.goto("/");

    const overlay = page.locator("#progress-overlay");
    await expect(overlay).toHaveClass(/hidden/);
  });

  test("filter links work", async ({ page }) => {
    await page.goto("/");

    // Click New Comments filter
    await page.click('a[href="/?filter=comments"]');
    await expect(page).toHaveURL("/?filter=comments");

    // Click New Today filter
    await page.click('a[href="/?filter=today"]');
    await expect(page).toHaveURL("/?filter=today");
  });
});

test.describe("Progress Bar", () => {
  test("shows progress overlay when refresh is clicked", async ({ page }) => {
    await page.goto("/");

    const overlay = page.locator("#progress-overlay");
    const refreshBtn = page.locator(".refresh-btn");

    // Initially hidden
    await expect(overlay).toHaveClass(/hidden/);

    // Click refresh
    await refreshBtn.click();

    // Overlay should become visible
    await expect(overlay).not.toHaveClass(/hidden/, { timeout: 5000 });

    // Progress text should update
    await expect(page.locator("#progress-text")).toBeVisible();
  });
});
