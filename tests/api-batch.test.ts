/**
 * Tests for batch indexer API endpoints.
 *
 * Note: These tests each create a fresh app instance to avoid
 * interference from the module-level activeBatchIndexer state.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";

const TEST_DB_PATH = "data/test-api-batch.db";

describe("Batch Indexer API", () => {
  let db: Database;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    // Insert test blogs
    for (let i = 0; i < 5; i++) {
      db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
        `https://blog${i}.example.com`,
        `Blog ${i}`,
      ]);
    }
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("GET /api/batch/status returns status info", async () => {
    const { createApp } = await import("../src/app");
    const { app } = createApp({ dbPath: TEST_DB_PATH });

    const res = await app.request("/api/batch/status");
    expect(res.status).toBe(200);

    const data = await res.json();
    // isRunning should be a boolean
    expect(typeof data.isRunning).toBe("boolean");
  });

  test("POST /api/batch/start starts the batch indexer", async () => {
    const { createApp } = await import("../src/app");
    const { app } = createApp({ dbPath: TEST_DB_PATH });

    const res = await app.request("/api/batch/start?concurrency=2&timeout=1000", {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("started");

    // Wait for batch to complete
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Check status shows stats
    const statusRes = await app.request("/api/batch/status");
    const statusData = await statusRes.json();
    expect(statusData.stats).not.toBeNull();
  });

  test("POST /api/batch/cancel returns error when no indexer active", async () => {
    const { createApp } = await import("../src/app");
    const { app } = createApp({ dbPath: TEST_DB_PATH });

    const res = await app.request("/api/batch/cancel", {
      method: "POST",
    });
    // Returns 404 (no indexer) or 400 (not running) depending on state
    expect([400, 404]).toContain(res.status);
  });

  test("GET /api/batch/stream sends SSE events", async () => {
    const { createApp } = await import("../src/app");
    const { app } = createApp({ dbPath: TEST_DB_PATH });

    const res = await app.request("/api/batch/stream?concurrency=2&timeout=1000");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    // Read the stream
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    let receivedEvents: string[] = [];
    let buffer = "";

    // Read events until stream closes
    while (true) {
      const { value, done } = await reader!.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          receivedEvents.push(line.slice(6));
        }
      }
    }

    // Should have received some events
    expect(receivedEvents.length).toBeGreaterThan(0);

    const eventTypes = receivedEvents.map((e) => JSON.parse(e).type);
    // Should have either start+complete (success) or error
    expect(eventTypes.includes("start") || eventTypes.includes("error")).toBe(true);
  }, 30000); // 30 second timeout for streaming test
});

describe("Batch Indexer Integration", () => {
  let db: Database;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    // Insert a test blog
    db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
      "https://example.com",
      "Example",
    ]);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("batch indexer updates blog last_scraped_at via direct BatchIndexer", async () => {
    // Use BatchIndexer directly to avoid module-level state issues
    const { BatchIndexer } = await import("../src/indexer/batch-indexer");

    // Check initial state
    const beforeBlog = db.query("SELECT last_scraped_at FROM blogs WHERE id = 1").get() as {
      last_scraped_at: string | null;
    };
    expect(beforeBlog.last_scraped_at).toBeNull();

    const indexer = new BatchIndexer(db, {
      concurrency: 1,
      fetchTimeoutMs: 5000,
    });

    await indexer.runBatch();

    // Check blog was updated
    const afterBlog = db.query("SELECT last_scraped_at FROM blogs WHERE id = 1").get() as {
      last_scraped_at: string | null;
    };
    expect(afterBlog.last_scraped_at).not.toBeNull();
  }, 30000);

  test("batch indexer progress events include estimated time via direct BatchIndexer", async () => {
    const { BatchIndexer } = await import("../src/indexer/batch-indexer");

    // Insert more blogs for better time estimation
    for (let i = 1; i <= 5; i++) {
      db.run(`INSERT INTO blogs (url, name) VALUES (?, ?)`, [
        `https://blog${i}.example.com`,
        `Blog ${i}`,
      ]);
    }

    let foundTimeEstimate = false;

    const indexer = new BatchIndexer(db, {
      concurrency: 2,
      fetchTimeoutMs: 1000,
      onProgress: (stats) => {
        if (stats.processed > 0 && stats.estimatedSecondsRemaining !== undefined) {
          foundTimeEstimate = true;
        }
      },
    });

    await indexer.runBatch();

    expect(foundTimeEstimate).toBe(true);
  }, 30000);
});
