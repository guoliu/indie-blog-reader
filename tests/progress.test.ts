import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";

const TEST_DB_PATH = "data/test-progress.db";

// Note: SSE Progress tests for batch indexer are in tests/api-batch.test.ts
// The old /api/refresh/stream endpoint has been replaced by /api/batch/stream

describe("Live Update Integration", () => {
  let app: any;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    const { createSchema } = await import("../src/db");
    const db = new Database(TEST_DB_PATH);
    createSchema(db);
    db.close();

    const { createApp } = await import("../src/app");
    const result = createApp({ dbPath: TEST_DB_PATH });
    app = result.app;
  });

  afterAll(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("Homepage includes live update indicator", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain('id="live-indicator"');
    expect(html).toContain("live-dot");
    expect(html).toContain("Live");
  });

  test("Homepage includes SSE JavaScript for live updates", async () => {
    const res = await app.request("/");
    const html = await res.text();

    // Should use EventSource for SSE
    expect(html).toContain("EventSource");
    expect(html).toContain("/api/events");
  });
});
