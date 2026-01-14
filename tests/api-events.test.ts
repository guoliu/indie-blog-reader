/**
 * Tests for the SSE events API endpoint.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";
import { ArticleEventEmitter } from "../src/sse/event-emitter";

const TEST_DB_PATH = "data/test-events-api.db";

describe("/api/events endpoint", () => {
  let db: Database;
  let app: ReturnType<typeof import("../src/app").createApp>["app"];
  let eventEmitter: ArticleEventEmitter;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    // Insert a test blog
    db.run("INSERT INTO blogs (url, name, languages) VALUES (?, ?, ?)", [
      "https://test.example.com",
      "Test Blog",
      '["zh"]',
    ]);

    eventEmitter = new ArticleEventEmitter();

    const { createApp } = await import("../src/app");
    const result = createApp({ dbPath: TEST_DB_PATH, eventEmitter });
    app = result.app;
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("returns SSE content-type", async () => {
    const res = await app.request("/api/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test("returns 503 when event emitter not available", async () => {
    const { createApp } = await import("../src/app");
    const result = createApp({ dbPath: TEST_DB_PATH });
    const appWithoutEmitter = result.app;

    const res = await appWithoutEmitter.request("/api/events");
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.error).toBe("Event streaming not available");
  });

  test("accepts language filter parameter", async () => {
    const res = await app.request("/api/events?lang=zh");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });
});

describe("/api/indexer/status endpoint", () => {
  let db: Database;
  let app: ReturnType<typeof import("../src/app").createApp>["app"];

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    const { createApp } = await import("../src/app");
    const result = createApp({ dbPath: TEST_DB_PATH });
    app = result.app;
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("returns indexer status", async () => {
    const res = await app.request("/api/indexer/status");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("isRunning");
    expect(data).toHaveProperty("currentBlogId");
    expect(data).toHaveProperty("lastCrawlAt");
  });

  test("shows isRunning as false initially", async () => {
    const res = await app.request("/api/indexer/status");
    const data = await res.json();

    // Initially not running
    expect(data.isRunning).toBe(false);
  });
});
