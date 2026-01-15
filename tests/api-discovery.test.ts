/**
 * Tests for the discovery API endpoints.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";

const TEST_DB_PATH = "data/test-api-discovery.db";

describe("Discovery API", () => {
  let db: Database;
  let app: any;
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    // Store original fetch
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  beforeEach(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    // Create test database with schema
    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    // Create app with test database
    const { createApp } = await import("../src/app");
    const result = createApp({ dbPath: TEST_DB_PATH });
    app = result.app;
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    // Restore original fetch
    globalThis.fetch = originalFetch;
  });

  test("POST /api/discovery/run discovers blogs from seed sources", async () => {
    // Mock fetch to return test HTML
    globalThis.fetch = async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("personalsit.es")) {
        return new Response(`
          <html>
          <body>
            <a href="https://discovered-blog.example.com">Discovered Blog</a>
          </body>
          </html>
        `);
      }
      // Return empty for other seed sources
      return new Response("<html><body></body></html>");
    };

    const res = await app.request("/api/discovery/run?lang=en", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("completed");
    expect(data.totalDiscovered).toBeGreaterThanOrEqual(1);
  });

  test("POST /api/discovery/run filters by language", async () => {
    globalThis.fetch = async () => {
      return new Response(`
        <html><body>
          <a href="https://test-blog.example.com">Test</a>
        </body></html>
      `);
    };

    // Run with English filter
    const enRes = await app.request("/api/discovery/run?lang=en", {
      method: "POST",
    });
    const enData = await enRes.json();

    // Run with Chinese filter
    const zhRes = await app.request("/api/discovery/run?lang=zh", {
      method: "POST",
    });
    const zhData = await zhRes.json();

    // Both should succeed
    expect(enRes.status).toBe(200);
    expect(zhRes.status).toBe(200);

    // Should have processed different numbers of sources
    // (6 English sources vs 5 Chinese sources)
    expect(enData.sourcesProcessed).toBe(6);
    expect(zhData.sourcesProcessed).toBe(5);
  });

  test("POST /api/blogs/detect-languages re-detects blog languages", async () => {
    // Insert a blog with wrong language
    db.run(`INSERT INTO blogs (url, name, languages) VALUES (?, ?, ?)`, [
      "https://blog-to-redetect.example.com",
      "Test Blog",
      '["zh"]', // Wrong - will be re-detected
    ]);

    // Mock fetch to return English HTML
    globalThis.fetch = async () => {
      return new Response(`
        <html lang="en">
        <head><title>English Blog</title></head>
        <body>
          <p>This is an English blog with lots of English content for detection.</p>
        </body>
        </html>
      `);
    };

    const res = await app.request("/api/blogs/detect-languages?limit=10", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processed).toBeGreaterThanOrEqual(1);
  });

  test("POST /api/blogs/detect-languages skips already-correct languages", async () => {
    // Insert a blog that's already correct
    db.run(`INSERT INTO blogs (url, name, languages) VALUES (?, ?, ?)`, [
      "https://correct-blog.example.com",
      "Correct Blog",
      '["en"]', // Already English
    ]);

    const res = await app.request("/api/blogs/detect-languages?limit=10", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    // Should process 0 blogs since the default filter is ["zh"]
    expect(data.processed).toBe(0);
  });
});
