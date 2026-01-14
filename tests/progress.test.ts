import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";

const TEST_DB_PATH = "data/test-progress.db";

describe("SSE Progress Endpoint", () => {
  let db: Database;
  let app: any;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    // Insert test blogs for scraping
    db.run("INSERT INTO blogs (url, name, rss_url) VALUES (?, ?, ?)", [
      "https://example.com",
      "Example Blog",
      "https://example.com/feed.xml",
    ]);

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

  test("GET /api/refresh/stream returns SSE content-type", async () => {
    const res = await app.request("/api/refresh/stream?limit=1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
  });

  test("SSE stream sends progress events", async () => {
    const res = await app.request("/api/refresh/stream?limit=1");
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    let events: string[] = [];
    let done = false;

    // Read events with timeout
    const timeout = setTimeout(() => {
      done = true;
    }, 30000);

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;

      const chunk = decoder.decode(value);
      events.push(chunk);

      // Stop after receiving completion event
      if (chunk.includes('"type":"complete"') || chunk.includes('"type":"error"')) {
        break;
      }
    }

    clearTimeout(timeout);

    // Verify we got at least start and complete/error events
    const allEvents = events.join("");
    expect(allEvents).toContain("data:");

    // Should have a start event
    const hasStartOrProgress = allEvents.includes('"type":"start"') || allEvents.includes('"type":"progress"');
    const hasComplete = allEvents.includes('"type":"complete"') || allEvents.includes('"type":"error"');

    expect(hasStartOrProgress || hasComplete).toBe(true);
  }, 60000);

  test("SSE progress events have correct format", async () => {
    const res = await app.request("/api/refresh/stream?limit=1");
    const text = await res.text();

    // Events should be in SSE format: "data: {...}\n\n"
    const eventLines = text.split("\n").filter((line) => line.startsWith("data:"));
    expect(eventLines.length).toBeGreaterThan(0);

    // Parse first event to verify JSON structure
    const firstEventData = eventLines[0].replace("data: ", "");
    const parsed = JSON.parse(firstEventData);

    expect(parsed.type).toBeDefined();
    expect(["start", "progress", "complete", "error"]).toContain(parsed.type);
  }, 60000);
});

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
