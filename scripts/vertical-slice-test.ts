#!/usr/bin/env bun
/**
 * Vertical Slice Test - Tests the full crawl pipeline with multiple seed sources
 *
 * This script:
 * 1. Scrapes seed source membership (IndieWeb Webring, XXIIVV, etc.)
 * 2. Fingerprints a sample of members
 * 3. Extracts friend links
 * 4. Builds a mini-graph
 * 5. Reports coverage, accuracy, and speed metrics
 *
 * Usage: bun run scripts/vertical-slice-test.ts [--limit N] [--concurrency N] [--source NAME]
 */

import { Database } from "bun:sqlite";
import { createSchema } from "../src/db";
import { CrawlOrchestrator } from "../src/indexer/crawl-orchestrator";
import { WorkerPool } from "../src/indexer/worker-pool";
import { ConditionalHttpClient } from "../src/indexer/http-client";
import { scrapeSeedSource } from "../src/indexer/seed-scraper";
import type { SeedSource } from "../src/indexer/types";

// ============================================================================
// Configuration
// ============================================================================

interface Config {
  limit: number;
  concurrency: number;
  timeout: number;
  source: string;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    limit: 100, // Default to 100 for quick testing
    concurrency: 4,
    timeout: 15000,
    source: "all", // Use all sources by default
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];
    if (arg === "--limit" && nextArg) {
      config.limit = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--concurrency" && nextArg) {
      config.concurrency = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--timeout" && nextArg) {
      config.timeout = parseInt(nextArg, 10);
      i++;
    } else if (arg === "--source" && nextArg) {
      config.source = nextArg;
      i++;
    }
  }

  return config;
}

// ============================================================================
// Seed Sources
// ============================================================================

const SEED_SOURCES: SeedSource[] = [
  {
    url: "https://xn--sr8hvo.ws/directory",
    name: "IndieWeb Webring",
    type: "webring",
    languages: ["en"],
  },
  {
    url: "https://webring.xxiivv.com/",
    name: "XXIIVV Webring",
    type: "webring",
    languages: ["en"],
  },
  {
    url: "https://blogroll.org",
    name: "Ye Olde Blogroll",
    type: "directory",
    languages: ["en"],
  },
  {
    url: "https://personalsit.es",
    name: "personalsit.es",
    type: "directory",
    languages: ["en"],
  },
];

async function scrapeSeedSources(sourceName: string): Promise<string[]> {
  const sources =
    sourceName === "all"
      ? SEED_SOURCES
      : SEED_SOURCES.filter((s) => s.name.toLowerCase().includes(sourceName.toLowerCase()));

  if (sources.length === 0) {
    console.log(`No matching source for "${sourceName}"`);
    console.log("Available sources:", SEED_SOURCES.map((s) => s.name).join(", "));
    process.exit(1);
  }

  const allUrls = new Set<string>();

  for (const source of sources) {
    console.log(`[Scraper] Fetching ${source.name}...`);
    try {
      const blogs = await scrapeSeedSource(source, 15000);
      console.log(`[Scraper] ${source.name}: found ${blogs.length} blogs`);
      for (const blog of blogs) {
        allUrls.add(blog.url);
      }
    } catch (err) {
      console.log(`[Scraper] ${source.name}: failed - ${err}`);
    }
  }

  console.log(`[Scraper] Total unique URLs: ${allUrls.size}`);
  return Array.from(allUrls);
}

// ============================================================================
// Site Processing
// ============================================================================

interface CrawlResult {
  url: string;
  success: boolean;
  error?: string;
  ssg?: string | null;
  theme?: string | null;
  commentSystem?: string | null;
  hasRss?: boolean;
  hasOpml?: boolean;
  hasWebmention?: boolean;
  friendLinkCount?: number;
  responseTime?: number;
}

async function processSite(
  url: string,
  httpClient: ConditionalHttpClient,
  orchestrator: CrawlOrchestrator,
  db: Database,
  timeout: number
): Promise<CrawlResult> {
  const startTime = Date.now();

  try {
    // Fetch the page
    const result = await httpClient.fetch(url, { timeout });

    if (!result.ok) {
      return {
        url,
        success: false,
        error: result.error,
        responseTime: Date.now() - startTime,
      };
    }

    if (result.unchanged || !result.body) {
      return {
        url,
        success: true,
        responseTime: Date.now() - startTime,
      };
    }

    // Ensure site exists in DB
    let site = db.query("SELECT id FROM blogs WHERE url = ?").get(url) as {
      id: number;
    } | null;

    if (!site) {
      db.run("INSERT INTO blogs (url) VALUES (?)", [url]);
      site = db.query("SELECT id FROM blogs WHERE url = ?").get(url) as {
        id: number;
      };
    }

    // Process with orchestrator
    const processResult = await orchestrator.processSite({
      siteId: site.id,
      url,
      html: result.body,
    });

    return {
      url,
      success: true,
      ssg: processResult.fingerprint.ssg,
      theme: processResult.fingerprint.theme,
      commentSystem: processResult.fingerprint.commentSystem,
      hasRss: processResult.protocols.rss.supported,
      hasOpml: processResult.protocols.opml.supported,
      hasWebmention: processResult.protocols.webmention.supported,
      friendLinkCount: processResult.friendLinks.length,
      responseTime: Date.now() - startTime,
    };
  } catch (err) {
    return {
      url,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      responseTime: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Metrics & Reporting
// ============================================================================

interface Metrics {
  totalSites: number;
  successfulCrawls: number;
  failedCrawls: number;
  sitesWithSSG: number;
  sitesWithTheme: number;
  sitesWithCommentSystem: number;
  sitesWithRSS: number;
  sitesWithOPML: number;
  sitesWithWebmention: number;
  sitesWithFriendLinks: number;
  totalFriendLinks: number;
  avgResponseTime: number;
  totalTime: number;
  ssgDistribution: Record<string, number>;
  themeDistribution: Record<string, number>;
  commentSystemDistribution: Record<string, number>;
}

function calculateMetrics(results: CrawlResult[], totalTime: number): Metrics {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const ssgDistribution: Record<string, number> = {};
  const themeDistribution: Record<string, number> = {};
  const commentSystemDistribution: Record<string, number> = {};

  for (const r of successful) {
    if (r.ssg) {
      ssgDistribution[r.ssg] = (ssgDistribution[r.ssg] || 0) + 1;
    }
    if (r.theme) {
      themeDistribution[r.theme] = (themeDistribution[r.theme] || 0) + 1;
    }
    if (r.commentSystem) {
      commentSystemDistribution[r.commentSystem] =
        (commentSystemDistribution[r.commentSystem] || 0) + 1;
    }
  }

  const responseTimes = successful
    .filter((r) => r.responseTime)
    .map((r) => r.responseTime!);
  const avgResponseTime =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  return {
    totalSites: results.length,
    successfulCrawls: successful.length,
    failedCrawls: failed.length,
    sitesWithSSG: successful.filter((r) => r.ssg).length,
    sitesWithTheme: successful.filter((r) => r.theme).length,
    sitesWithCommentSystem: successful.filter((r) => r.commentSystem).length,
    sitesWithRSS: successful.filter((r) => r.hasRss).length,
    sitesWithOPML: successful.filter((r) => r.hasOpml).length,
    sitesWithWebmention: successful.filter((r) => r.hasWebmention).length,
    sitesWithFriendLinks: successful.filter(
      (r) => r.friendLinkCount && r.friendLinkCount > 0
    ).length,
    totalFriendLinks: successful.reduce(
      (sum, r) => sum + (r.friendLinkCount || 0),
      0
    ),
    avgResponseTime,
    totalTime,
    ssgDistribution,
    themeDistribution,
    commentSystemDistribution,
  };
}

function printReport(metrics: Metrics): void {
  const successRate = ((metrics.successfulCrawls / metrics.totalSites) * 100).toFixed(1);
  const fingerprintRate = (
    (metrics.sitesWithSSG / metrics.successfulCrawls) *
    100
  ).toFixed(1);
  const friendLinkRate = (
    (metrics.sitesWithFriendLinks / metrics.successfulCrawls) *
    100
  ).toFixed(1);

  console.log("\n" + "=".repeat(60));
  console.log("VERTICAL SLICE TEST RESULTS - Indie Blog Crawl");
  console.log("=".repeat(60));

  console.log("\n📊 CRAWL SUMMARY");
  console.log("-".repeat(40));
  console.log(`  Total sites:        ${metrics.totalSites}`);
  console.log(
    `  Successful:         ${metrics.successfulCrawls} (${successRate}%)`
  );
  console.log(`  Failed:             ${metrics.failedCrawls}`);
  console.log(
    `  Total time:         ${(metrics.totalTime / 1000).toFixed(1)}s`
  );
  console.log(
    `  Avg response time:  ${metrics.avgResponseTime.toFixed(0)}ms`
  );
  console.log(
    `  Throughput:         ${(
      (metrics.totalSites / metrics.totalTime) *
      1000
    ).toFixed(1)} sites/sec`
  );

  console.log("\n🔍 FINGERPRINTING");
  console.log("-".repeat(40));
  console.log(
    `  SSG detected:       ${metrics.sitesWithSSG} (${fingerprintRate}%)`
  );
  console.log(`  Theme detected:     ${metrics.sitesWithTheme}`);
  console.log(`  Comment system:     ${metrics.sitesWithCommentSystem}`);

  if (Object.keys(metrics.ssgDistribution).length > 0) {
    console.log("\n  Top SSGs:");
    const sortedSSGs = Object.entries(metrics.ssgDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [ssg, count] of sortedSSGs) {
      console.log(`    ${ssg}: ${count}`);
    }
  }

  if (Object.keys(metrics.themeDistribution).length > 0) {
    console.log("\n  Top Themes:");
    const sortedThemes = Object.entries(metrics.themeDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    for (const [theme, count] of sortedThemes) {
      console.log(`    ${theme}: ${count}`);
    }
  }

  console.log("\n🔗 PROTOCOLS & FRIEND LINKS");
  console.log("-".repeat(40));
  console.log(`  RSS feeds:          ${metrics.sitesWithRSS}`);
  console.log(`  OPML blogrolls:     ${metrics.sitesWithOPML}`);
  console.log(`  WebMention:         ${metrics.sitesWithWebmention}`);
  console.log(
    `  Has friend links:   ${metrics.sitesWithFriendLinks} (${friendLinkRate}%)`
  );
  console.log(`  Total friend links: ${metrics.totalFriendLinks}`);

  console.log("\n✅ SUCCESS CRITERIA");
  console.log("-".repeat(40));
  const ssgTarget = 90;
  const friendLinkTarget = 70;
  const throughputTarget = 10;
  const actualThroughput =
    (metrics.totalSites / metrics.totalTime) * 1000 * 60;

  console.log(
    `  SSG detection >= ${ssgTarget}%:     ${
      parseFloat(fingerprintRate) >= ssgTarget ? "✅ PASS" : "❌ FAIL"
    } (${fingerprintRate}%)`
  );
  console.log(
    `  Friend links >= ${friendLinkTarget}%:  ${
      parseFloat(friendLinkRate) >= friendLinkTarget ? "✅ PASS" : "❌ FAIL"
    } (${friendLinkRate}%)`
  );
  console.log(
    `  Throughput >= ${throughputTarget} sites/min: ${
      actualThroughput >= throughputTarget ? "✅ PASS" : "❌ FAIL"
    } (${actualThroughput.toFixed(1)}/min)`
  );

  console.log("\n" + "=".repeat(60));
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs();

  console.log("🚀 Starting Vertical Slice Test");
  console.log(`   Limit: ${config.limit} sites`);
  console.log(`   Concurrency: ${config.concurrency}`);
  console.log(`   Timeout: ${config.timeout}ms`);
  console.log(`   Source: ${config.source}`);

  // Initialize database (in-memory for testing)
  const db = new Database(":memory:");
  createSchema(db);

  // Initialize components
  const httpClient = new ConditionalHttpClient();
  const orchestrator = new CrawlOrchestrator({ db });

  // Scrape seed sources
  const allUrls = await scrapeSeedSources(config.source);
  const urls = allUrls.slice(0, config.limit);

  console.log(`\n[Crawl] Processing ${urls.length} sites...`);

  // Create worker pool
  const pool = new WorkerPool<string, CrawlResult>({
    concurrency: config.concurrency,
    worker: async (url) =>
      processSite(url, httpClient, orchestrator, db, config.timeout),
    onProgress: (progress) => {
      const pct = ((progress.completed / progress.total) * 100).toFixed(0);
      process.stdout.write(
        `\r[Crawl] Progress: ${progress.completed}/${progress.total} (${pct}%) - ${progress.succeeded} ok, ${progress.failed} err`
      );
    },
  });

  const startTime = Date.now();
  const results = await pool.run(urls);
  const totalTime = Date.now() - startTime;

  console.log("\n");

  // Calculate and print metrics
  const metrics = calculateMetrics(results, totalTime);
  printReport(metrics);

  // Build trust graph
  console.log("\n[Graph] Building trust graph...");
  await orchestrator.buildTrustGraph();

  const stats = await orchestrator.getGraphStats();
  console.log(`[Graph] Total sites: ${stats.totalSites}`);
  console.log(`[Graph] Total relationships: ${stats.totalRelationships}`);
  console.log(`[Graph] Avg trust score: ${stats.avgTrustScore.toFixed(3)}`);

  // Find derived seed candidates
  const candidates = await orchestrator.findDerivedSeedCandidates();
  console.log(`[Graph] Derived seed candidates: ${candidates.length}`);

  // Cleanup
  db.close();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
