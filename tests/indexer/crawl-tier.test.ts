import { describe, test, expect } from "bun:test";

/**
 * Tests for crawl tier calculation and polling intervals
 *
 * Tiers:
 * - active: posted within 7 days → check hourly
 * - normal: posted within 90 days → check every 6 hours
 * - dormant: no posts in 90+ days → check weekly
 */
describe("CrawlTier", () => {
  describe("determineTier", () => {
    test("returns active for sites with posts in last 7 days", async () => {
      const { determineTier } = await import("../../src/indexer/crawl-tier");

      const now = Date.now();
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

      const tier = determineTier({ latestPostAt: threeDaysAgo });

      expect(tier).toBe("active");
    });

    test("returns active for sites with post exactly 7 days ago", async () => {
      const { determineTier } = await import("../../src/indexer/crawl-tier");

      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      const tier = determineTier({ latestPostAt: sevenDaysAgo });

      expect(tier).toBe("active");
    });

    test("returns normal for sites with posts 8-90 days ago", async () => {
      const { determineTier } = await import("../../src/indexer/crawl-tier");

      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

      const tier = determineTier({ latestPostAt: thirtyDaysAgo });

      expect(tier).toBe("normal");
    });

    test("returns normal for sites with post exactly 90 days ago", async () => {
      const { determineTier } = await import("../../src/indexer/crawl-tier");

      const now = Date.now();
      const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

      const tier = determineTier({ latestPostAt: ninetyDaysAgo });

      expect(tier).toBe("normal");
    });

    test("returns dormant for sites with no posts in 90+ days", async () => {
      const { determineTier } = await import("../../src/indexer/crawl-tier");

      const now = Date.now();
      const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;

      const tier = determineTier({ latestPostAt: sixMonthsAgo });

      expect(tier).toBe("dormant");
    });

    test("returns dormant for sites with no posts ever", async () => {
      const { determineTier } = await import("../../src/indexer/crawl-tier");

      const tier = determineTier({ latestPostAt: null });

      expect(tier).toBe("dormant");
    });

    test("returns dormant for sites with undefined latestPostAt", async () => {
      const { determineTier } = await import("../../src/indexer/crawl-tier");

      const tier = determineTier({});

      expect(tier).toBe("dormant");
    });
  });

  describe("getPollingInterval", () => {
    test("returns 1 hour for active tier", async () => {
      const { getPollingInterval } = await import(
        "../../src/indexer/crawl-tier"
      );

      const interval = getPollingInterval("active");

      expect(interval).toBe(1 * 60 * 60 * 1000); // 1 hour in ms
    });

    test("returns 6 hours for normal tier", async () => {
      const { getPollingInterval } = await import(
        "../../src/indexer/crawl-tier"
      );

      const interval = getPollingInterval("normal");

      expect(interval).toBe(6 * 60 * 60 * 1000); // 6 hours in ms
    });

    test("returns 7 days for dormant tier", async () => {
      const { getPollingInterval } = await import(
        "../../src/indexer/crawl-tier"
      );

      const interval = getPollingInterval("dormant");

      expect(interval).toBe(7 * 24 * 60 * 60 * 1000); // 7 days in ms
    });
  });

  describe("calculateNextCrawlAt", () => {
    test("calculates next crawl time based on tier", async () => {
      const { calculateNextCrawlAt, getPollingInterval } = await import(
        "../../src/indexer/crawl-tier"
      );

      const now = Date.now();
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

      const nextCrawl = calculateNextCrawlAt({
        lastCrawledAt: now,
        latestPostAt: threeDaysAgo,
      });

      // Active tier = 1 hour interval
      const expectedInterval = getPollingInterval("active");
      expect(nextCrawl).toBe(now + expectedInterval);
    });

    test("schedules immediately if never crawled", async () => {
      const { calculateNextCrawlAt } = await import(
        "../../src/indexer/crawl-tier"
      );

      const now = Date.now();
      const nextCrawl = calculateNextCrawlAt({
        lastCrawledAt: null,
        latestPostAt: null,
      });

      // Should be scheduled for now or very soon
      expect(nextCrawl).toBeLessThanOrEqual(now + 1000);
    });

    test("uses dormant interval for sites with no posts", async () => {
      const { calculateNextCrawlAt, getPollingInterval } = await import(
        "../../src/indexer/crawl-tier"
      );

      const now = Date.now();
      const nextCrawl = calculateNextCrawlAt({
        lastCrawledAt: now,
        latestPostAt: null,
      });

      const dormantInterval = getPollingInterval("dormant");
      expect(nextCrawl).toBe(now + dormantInterval);
    });
  });

  describe("shouldCrawlNow", () => {
    test("returns true if next_crawl_at is in the past", async () => {
      const { shouldCrawlNow } = await import("../../src/indexer/crawl-tier");

      const now = Date.now();
      const oneHourAgo = now - 60 * 60 * 1000;

      const should = shouldCrawlNow({ nextCrawlAt: oneHourAgo });

      expect(should).toBe(true);
    });

    test("returns true if next_crawl_at is now", async () => {
      const { shouldCrawlNow } = await import("../../src/indexer/crawl-tier");

      const now = Date.now();

      const should = shouldCrawlNow({ nextCrawlAt: now });

      expect(should).toBe(true);
    });

    test("returns false if next_crawl_at is in the future", async () => {
      const { shouldCrawlNow } = await import("../../src/indexer/crawl-tier");

      const now = Date.now();
      const oneHourFromNow = now + 60 * 60 * 1000;

      const should = shouldCrawlNow({ nextCrawlAt: oneHourFromNow });

      expect(should).toBe(false);
    });

    test("returns true if next_crawl_at is null (never scheduled)", async () => {
      const { shouldCrawlNow } = await import("../../src/indexer/crawl-tier");

      const should = shouldCrawlNow({ nextCrawlAt: null });

      expect(should).toBe(true);
    });
  });

  describe("TIER_THRESHOLDS", () => {
    test("exports threshold constants", async () => {
      const { TIER_THRESHOLDS } = await import("../../src/indexer/crawl-tier");

      expect(TIER_THRESHOLDS.ACTIVE_DAYS).toBe(7);
      expect(TIER_THRESHOLDS.NORMAL_DAYS).toBe(90);
    });
  });
});
