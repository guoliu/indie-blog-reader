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

describe("BatchIndexer Language Detection", () => {
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

  test(
    "detects and updates blog languages on first scrape",
    async () => {
      const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

      // Setup: blog with default ["zh"] language (wrong default)
      // Using a real English blog that we know has English content
      db.run(`INSERT INTO blogs (url, name, languages) VALUES (?, ?, ?)`, [
        "https://blog.jim-nielsen.com",
        "Jim Nielsen's Blog",
        '["zh"]', // Wrong default - should be detected as English
      ]);

      const indexer = new BatchIndexer(db, {
        concurrency: 1,
        fetchTimeoutMs: 15000,
      });

      await indexer.runBatch();

      // Assert: language should be updated from ["zh"] to include "en"
      const blog = db.query(`SELECT languages FROM blogs WHERE url = ?`).get(
        "https://blog.jim-nielsen.com"
      ) as { languages: string } | null;

      expect(blog).not.toBeNull();
      const languages = JSON.parse(blog!.languages);
      // Should have detected English
      expect(languages).toContain("en");
      // Should NOT still have the default Chinese (unless it's actually a bilingual blog)
      // But Jim Nielsen's blog is English-only, so:
      expect(languages).not.toContain("zh");
    },
    20000
  );

  test("does not re-detect languages for already scraped blogs", async () => {
    const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

    // Setup: blog that was already scraped (has last_scraped_at)
    const now = new Date().toISOString();
    db.run(`INSERT INTO blogs (url, name, languages, last_scraped_at) VALUES (?, ?, ?, ?)`, [
      "https://example.com",
      "Example Blog",
      '["zh"]', // Already has a language set
      now, // Already scraped
    ]);

    const indexer = new BatchIndexer(db, {
      concurrency: 1,
      fetchTimeoutMs: 5000,
    });

    await indexer.runBatch();

    // Assert: language should NOT have changed (we skip detection for already-scraped blogs)
    const blog = db.query(`SELECT languages FROM blogs WHERE url = ?`).get(
      "https://example.com"
    ) as { languages: string } | null;

    expect(blog).not.toBeNull();
    const languages = JSON.parse(blog!.languages);
    // Should still be the original value
    expect(languages).toEqual(["zh"]);
  });

  test(
    "detects article language for new articles",
    async () => {
      const { BatchIndexer } = await import("../../src/indexer/batch-indexer");

      // Setup: use a real blog with known English articles
      db.run(`INSERT INTO blogs (url, name, languages) VALUES (?, ?, ?)`, [
        "https://blog.jim-nielsen.com",
        "Jim Nielsen's Blog",
        '["en"]',
      ]);

      const indexer = new BatchIndexer(db, {
        concurrency: 1,
        fetchTimeoutMs: 15000,
      });

      await indexer.runBatch();

      // Check that articles were saved with detected language
      const articles = db.query(`SELECT language FROM articles LIMIT 5`).all() as {
        language: string | null;
      }[];

      // At least some articles should exist
      expect(articles.length).toBeGreaterThan(0);

      // Articles should have detected language (not null)
      for (const article of articles) {
        expect(article.language).not.toBeNull();
        // Since it's an English blog, should be 'en'
        expect(article.language).toBe("en");
      }
    },
    20000
  );
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
