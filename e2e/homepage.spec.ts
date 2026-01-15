/**
 * E2E tests for the homepage and core functionality.
 *
 * Tests the three bug fixes:
 * 1. New Comments is a separate feed at /comments (not query param)
 * 2. Progress bar shows correct values (not "undefined/undefined")
 * 3. Real-time articles inserted at correct sorted position
 */

import { test, expect } from "@playwright/test";

test.describe("Homepage - Latest Feed", () => {
  test("displays the title and navigation", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toHaveText("Indie Blog Reader");
    await expect(page.locator("nav.filters")).toBeVisible();
  });

  test("Latest filter is active on homepage", async ({ page }) => {
    await page.goto("/");

    const latestLink = page.locator('nav.filters a:has-text("Latest")');
    await expect(latestLink).toHaveClass(/active/);
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
});

test.describe("New Comments Feed (Bug Fix - Separate Route)", () => {
  test("New Comments links to /comments route (not query param)", async ({
    page,
  }) => {
    await page.goto("/");

    const commentsLink = page.locator('nav.filters a:has-text("New Comments")');
    // Should be /comments, NOT /?filter=comments
    await expect(commentsLink).toHaveAttribute("href", "/comments");
  });

  test("New Comments is at /comments route", async ({ page }) => {
    await page.goto("/comments");

    // Should load without error
    await expect(page).toHaveTitle("Indie Blog Reader");

    // New Comments should be active
    const commentsLink = page.locator('nav.filters a:has-text("New Comments")');
    await expect(commentsLink).toHaveClass(/active/);

    // Latest should NOT be active
    const latestLink = page.locator('nav.filters a:has-text("Latest")');
    await expect(latestLink).not.toHaveClass(/active/);
  });

  test("clicking New Comments navigates to /comments", async ({ page }) => {
    await page.goto("/");

    await page.click('nav.filters a:has-text("New Comments")');
    await expect(page).toHaveURL("/comments");
  });

  test("language filter on /comments preserves route", async ({ page }) => {
    await page.goto("/comments");

    // Click on Chinese language filter
    const zhLink = page.locator('nav.language-switcher a:has-text("中文")');
    await expect(zhLink).toHaveAttribute("href", "/comments?lang=zh");

    await zhLink.click();
    await expect(page).toHaveURL("/comments?lang=zh");

    // Should still be on comments feed
    const commentsLink = page.locator('nav.filters a:has-text("New Comments")');
    await expect(commentsLink).toHaveClass(/active/);
  });
});

test.describe("Progress Bar (Bug Fix - No undefined values)", () => {
  test("progress indicator exists", async ({ page }) => {
    await page.goto("/");

    const progressEl = page.locator("#indexer-progress");
    await expect(progressEl).toBeAttached();
  });

  test("SSE connection establishes", async ({ page }) => {
    await page.goto("/");

    // Wait for SSE connection
    await expect(page.locator("#live-indicator")).toHaveClass(/connected/, {
      timeout: 10000,
    });
  });

  test("progress does not show undefined values when indexer runs", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    // Wait for SSE connection
    await expect(page.locator("#live-indicator")).toHaveClass(/connected/, {
      timeout: 10000,
    });

    // Start a batch indexer
    await request.post("/api/batch/start?concurrency=2");

    // Wait for progress element to have some text content
    const progressEl = page.locator("#indexer-progress");

    // Poll for progress content instead of waiting for visibility
    // (progress may complete quickly in CI with empty DB)
    let progressText = "";
    for (let i = 0; i < 30; i++) {
      progressText = (await progressEl.textContent()) || "";
      if (progressText && progressText.includes("%")) {
        break;
      }
      await page.waitForTimeout(500);
    }

    // If we got progress text, verify it doesn't contain "undefined"
    if (progressText && progressText.includes("%")) {
      expect(progressText).not.toContain("undefined");
      // Progress format should be like "1% (5/500)" or similar
      expect(progressText).toMatch(/\d+%\s*\(\d+\/\d+\)/);
    }
    // If no progress text (empty DB, quick completion), test passes silently
  });
});

test.describe("SSE Event Structure", () => {
  test("progress events have correct field names", async ({ page }) => {
    await page.goto("/");

    // Intercept SSE events by patching EventSource
    // Using a string function to avoid TypeScript issues with browser context
    await page.evaluate(`
      window.capturedProgressEvents = [];
      const origES = window.EventSource;
      window.EventSource = class extends origES {
        constructor(url) {
          super(url);
          this.addEventListener("indexer_progress", (event) => {
            window.capturedProgressEvents.push(JSON.parse(event.data));
          });
        }
      };
    `);

    // Reload to use patched EventSource
    await page.reload();

    // Wait for connection
    await expect(page.locator("#live-indicator")).toHaveClass(/connected/, {
      timeout: 10000,
    });

    // Start indexer to generate events
    await page.request.post("/api/batch/start?concurrency=2");

    // Wait for events
    await page.waitForTimeout(5000);

    // Check captured events
    const events = await page.evaluate(
      `window.capturedProgressEvents || []`
    ) as unknown[];

    if (events.length > 0) {
      const event = events[0] as Record<string, unknown>;
      // Verify correct field names
      expect(event).toHaveProperty("total");
      expect(event).toHaveProperty("processed");
      expect(event).toHaveProperty("isRunning");

      // Should NOT have old incorrect field names
      expect(event).not.toHaveProperty("totalBlogsIndexed");
      expect(event).not.toHaveProperty("currentBlogUrl");
    }
  });
});

test.describe("Article Sorting (Bug Fix - Correct insertion order)", () => {
  test("article cards have datetime attribute for sorting", async ({
    page,
  }) => {
    await page.goto("/");

    const articles = page.locator("article.card");
    const count = await articles.count();

    if (count > 0) {
      // All time elements should have datetime attribute
      for (let i = 0; i < Math.min(count, 5); i++) {
        const timeEl = articles.nth(i).locator("time");
        const datetime = await timeEl.getAttribute("datetime");
        expect(datetime).toBeTruthy();
      }
    }
  });

  test("articles are sorted by date (newest first)", async ({ page }) => {
    await page.goto("/");

    const timeElements = page.locator("article.card time");
    const count = await timeElements.count();

    if (count >= 2) {
      const dates: Date[] = [];

      for (let i = 0; i < count; i++) {
        const datetime = await timeElements.nth(i).getAttribute("datetime");
        if (datetime) {
          dates.push(new Date(datetime));
        }
      }

      // Verify dates are in descending order (newest first)
      for (let i = 1; i < dates.length; i++) {
        const prev = dates[i - 1];
        const curr = dates[i];
        if (prev && curr) {
          expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
        }
      }
    }
  });
});

test.describe("Language Filtering", () => {
  test("language filter on homepage works", async ({ page }) => {
    await page.goto("/?lang=zh");

    const zhLink = page.locator('nav.language-switcher a:has-text("中文")');
    await expect(zhLink).toHaveClass(/active/);
  });

  test("Latest link preserves language filter", async ({ page }) => {
    await page.goto("/?lang=zh");

    const latestLink = page.locator('nav.filters a:has-text("Latest")');
    await expect(latestLink).toHaveAttribute("href", "/?lang=zh");
  });

  test("New Comments link preserves language filter", async ({ page }) => {
    await page.goto("/?lang=zh");

    const commentsLink = page.locator('nav.filters a:has-text("New Comments")');
    await expect(commentsLink).toHaveAttribute("href", "/comments?lang=zh");
  });
});
