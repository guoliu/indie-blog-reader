/**
 * Crawl tier calculation for tiered polling strategy
 *
 * Tiers determine how frequently a site should be checked for updates:
 * - active: posted within 7 days → check hourly (site is actively updating)
 * - normal: posted within 90 days → check every 6 hours (moderate activity)
 * - dormant: no posts in 90+ days → check weekly (likely inactive)
 */

export type CrawlTier = "active" | "normal" | "dormant";

/** Threshold constants for tier determination */
export const TIER_THRESHOLDS = {
  /** Days since last post to be considered "active" */
  ACTIVE_DAYS: 7,
  /** Days since last post to be considered "normal" (vs dormant) */
  NORMAL_DAYS: 90,
} as const;

/** Polling intervals in milliseconds */
const POLLING_INTERVALS: Record<CrawlTier, number> = {
  active: 1 * 60 * 60 * 1000, // 1 hour
  normal: 6 * 60 * 60 * 1000, // 6 hours
  dormant: 7 * 24 * 60 * 60 * 1000, // 7 days
};

interface DetermineTierInput {
  /** Timestamp of most recent post (ms since epoch), or null/undefined if no posts */
  latestPostAt?: number | null;
}

/**
 * Determine the crawl tier based on site activity
 */
export function determineTier(input: DetermineTierInput): CrawlTier {
  const { latestPostAt } = input;

  if (latestPostAt == null) {
    return "dormant";
  }

  const now = Date.now();
  const daysSincePost = (now - latestPostAt) / (24 * 60 * 60 * 1000);

  if (daysSincePost <= TIER_THRESHOLDS.ACTIVE_DAYS) {
    return "active";
  }

  if (daysSincePost <= TIER_THRESHOLDS.NORMAL_DAYS) {
    return "normal";
  }

  return "dormant";
}

/**
 * Get the polling interval for a given tier
 */
export function getPollingInterval(tier: CrawlTier): number {
  return POLLING_INTERVALS[tier];
}

interface CalculateNextCrawlInput {
  /** Timestamp of last crawl (ms since epoch), or null if never crawled */
  lastCrawledAt?: number | null;
  /** Timestamp of most recent post (ms since epoch), or null if no posts */
  latestPostAt?: number | null;
}

/**
 * Calculate when the next crawl should occur
 */
export function calculateNextCrawlAt(input: CalculateNextCrawlInput): number {
  const { lastCrawledAt, latestPostAt } = input;

  // Never crawled - schedule immediately
  if (lastCrawledAt == null) {
    return Date.now();
  }

  const tier = determineTier({ latestPostAt });
  const interval = getPollingInterval(tier);

  return lastCrawledAt + interval;
}

interface ShouldCrawlNowInput {
  /** Scheduled next crawl time (ms since epoch), or null if not scheduled */
  nextCrawlAt?: number | null;
}

/**
 * Check if a site should be crawled now based on its schedule
 */
export function shouldCrawlNow(input: ShouldCrawlNowInput): boolean {
  const { nextCrawlAt } = input;

  // Not scheduled - should crawl immediately
  if (nextCrawlAt == null) {
    return true;
  }

  return Date.now() >= nextCrawlAt;
}
