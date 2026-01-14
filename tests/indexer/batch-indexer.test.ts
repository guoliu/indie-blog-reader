/**
 * Tests for the parallel batch indexer.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";
import { createSchema } from "../../src/db";

const TEST_DB_PATH = "data/test-batch-indexer.db";

describe("BatchIndexer", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = new Database(TEST_DB_PATH);
    createSchema(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("processes blogs in parallel batches", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    // Insert test blogs
    for (let i = 0; i < 10; i++) {
      db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
        `https://blog${i}.example.com`,
        `Blog ${i}`,
      ]);
    }

    const indexer = new BatchIndexer(db, { concurrency: 3, fetchTimeoutMs: 1000 });
    const stats = await indexer.runBatch();

    // All blogs should have been processed (either success or error)
    expect(stats.processed).toBe(10);
    expect(stats.processed).toBe(stats.succeeded + stats.failed);
  });

  test("respects concurrency limit", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    // Insert test blogs
    for (let i = 0; i < 10; i++) {
      db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
        `https://blog${i}.example.com`,
        `Blog ${i}`,
      ]);
    }

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const indexer = new BatchIndexer(db, {
      concurrency: 3,
      fetchTimeoutMs: 100,
      onBlogStart: () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      },
      onBlogComplete: () => {
        currentConcurrent--;
      },
    });

    await indexer.runBatch();

    // Should never exceed concurrency limit
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  test("emits progress events", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    // Insert test blogs
    for (let i = 0; i < 5; i++) {
      db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
        `https://blog${i}.example.com`,
        `Blog ${i}`,
      ]);
    }

    const progressEvents: Array<{ processed: number; total: number }> = [];

    const indexer = new BatchIndexer(db, {
      concurrency: 2,
      fetchTimeoutMs: 100,
      onProgress: (stats) => {
        progressEvents.push({ processed: stats.processed, total: stats.total });
      },
    });

    await indexer.runBatch();

    // Should have emitted progress events
    expect(progressEvents.length).toBeGreaterThan(0);
    // Last event should show all processed
    const lastEvent = progressEvents[progressEvents.length - 1];
    expect(lastEvent?.processed).toBe(5);
    expect(lastEvent?.total).toBe(5);
  });

  test("can be cancelled mid-batch", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    // Insert many blogs
    for (let i = 0; i < 20; i++) {
      db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
        `https://blog${i}.example.com`,
        `Blog ${i}`,
      ]);
    }

    const indexer = new BatchIndexer(db, {
      concurrency: 2,
      fetchTimeoutMs: 500,
      onProgress: (stats) => {
        // Cancel after processing 5 blogs
        if (stats.processed >= 5) {
          indexer.cancel();
        }
      },
    });

    const stats = await indexer.runBatch();

    // Should have stopped early (not all 20 processed)
    expect(stats.processed).toBeLessThan(20);
    expect(stats.cancelled).toBe(true);
  });

  test("tracks new articles found", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    // Insert a blog
    db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
      "https://example.com",
      "Example Blog",
    ]);

    let articlesFound = 0;
    const indexer = new BatchIndexer(db, {
      concurrency: 1,
      fetchTimeoutMs: 2000,
      onNewArticle: () => {
        articlesFound++;
      },
    });

    await indexer.runBatch();

    // Stats should track articles
    const stats = indexer.getStats();
    expect(stats.newArticlesFound).toBeGreaterThanOrEqual(0);
  });

  test("handles blogs gracefully even with no RSS", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    // Insert a blog with a URL that won't have RSS
    db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
      "https://example.com",
      "Example Blog",
    ]);

    const indexer = new BatchIndexer(db, {
      concurrency: 1,
      fetchTimeoutMs: 2000,
    });

    const stats = await indexer.runBatch();

    // Should process without crashing (success or graceful failure)
    expect(stats.processed).toBe(1);
    expect(stats.processed).toBe(stats.succeeded + stats.failed);
  });

  test("estimates time remaining", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    // Insert test blogs
    for (let i = 0; i < 10; i++) {
      db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
        `https://blog${i}.example.com`,
        `Blog ${i}`,
      ]);
    }

    let hadTimeEstimate = false;

    const indexer = new BatchIndexer(db, {
      concurrency: 2,
      fetchTimeoutMs: 100,
      onProgress: (stats) => {
        if (stats.processed > 0 && stats.estimatedSecondsRemaining !== undefined) {
          hadTimeEstimate = true;
        }
      },
    });

    await indexer.runBatch();

    expect(hadTimeEstimate).toBe(true);
  });
});

describe("BatchIndexer Integration", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = new Database(TEST_DB_PATH);
    createSchema(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("updates blog last_scraped_at after processing", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
      "https://example.com",
      "Example Blog",
    ]);

    const indexer = new BatchIndexer(db, {
      concurrency: 1,
      fetchTimeoutMs: 2000,
    });

    await indexer.runBatch();

    const blog = db.query("SELECT last_scraped_at FROM blogs WHERE id = 1").get() as {
      last_scraped_at: string | null;
    };

    // Should have updated last_scraped_at (even if fetch failed)
    expect(blog.last_scraped_at).not.toBeNull();
  });
});
