/**
 * Tests for the seed source scraper.
 *
 * Tests discovery of blogs from webrings and directories.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";
import { createSchema } from "../../src/db";

const TEST_DB_PATH = "data/test-seed-scraper.db";

describe("SeedSourceScraper", () => {
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

  describe("parseWebringDirectory", () => {
    test("extracts blog URLs from IndieWeb Webring HTML", async () => {
      const { parseWebringDirectory } = await import("../../src/indexer/seed-scraper");

      // Simulated IndieWeb Webring directory HTML
      const html = `
        <html>
        <body>
          <ul class="directory">
            <li><a href="https://example.com">Example Blog</a></li>
            <li><a href="https://blog.test.org">Test Blog</a></li>
            <li><a href="https://personal.site/blog">Personal Site</a></li>
          </ul>
        </body>
        </html>
      `;

      const blogs = parseWebringDirectory(html, {
        url: "https://xn--sr8hvo.ws/directory",
        name: "IndieWeb Webring",
        type: "webring",
        languages: ["en"],
      });

      expect(blogs).toHaveLength(3);
      expect(blogs[0]?.url).toBe("https://example.com");
      expect(blogs[1]?.url).toBe("https://blog.test.org");
      expect(blogs[2]?.url).toBe("https://personal.site/blog");
    });

    test("filters out invalid URLs", async () => {
      const { parseWebringDirectory } = await import("../../src/indexer/seed-scraper");

      const html = `
        <html>
        <body>
          <a href="https://valid-blog.com">Valid</a>
          <a href="/relative-link">Relative</a>
          <a href="mailto:test@example.com">Email</a>
          <a href="javascript:void(0)">JS</a>
          <a href="https://twitter.com/user">Twitter</a>
          <a href="https://github.com/user">GitHub</a>
        </body>
        </html>
      `;

      const blogs = parseWebringDirectory(html, {
        url: "https://test.com",
        name: "Test",
        type: "webring",
        languages: ["en"],
      });

      // Only valid blog URL should be extracted
      expect(blogs).toHaveLength(1);
      expect(blogs[0]?.url).toBe("https://valid-blog.com");
    });

    test("deduplicates URLs", async () => {
      const { parseWebringDirectory } = await import("../../src/indexer/seed-scraper");

      const html = `
        <html>
        <body>
          <a href="https://example.com">First Link</a>
          <a href="https://example.com/">Same with slash</a>
          <a href="https://example.com">Duplicate</a>
        </body>
        </html>
      `;

      const blogs = parseWebringDirectory(html, {
        url: "https://test.com",
        name: "Test",
        type: "webring",
        languages: ["en"],
      });

      // Should deduplicate
      expect(blogs).toHaveLength(1);
      expect(blogs[0]?.url).toBe("https://example.com");
    });
  });

  describe("parseDirectoryPage", () => {
    test("extracts blog URLs from ooh.directory format", async () => {
      const { parseDirectoryPage } = await import("../../src/indexer/seed-scraper");

      const html = `
        <html>
        <body>
          <div class="entry">
            <a href="https://blog1.example.com" class="title">Blog 1</a>
            <p>Description of blog 1</p>
          </div>
          <div class="entry">
            <a href="https://blog2.example.com" class="title">Blog 2</a>
            <p>Description of blog 2</p>
          </div>
        </body>
        </html>
      `;

      const blogs = parseDirectoryPage(html, {
        url: "https://ooh.directory",
        name: "ooh.directory",
        type: "directory",
        languages: ["en"],
      });

      expect(blogs.length).toBeGreaterThanOrEqual(2);
    });

    test("extracts blog URLs from personalsit.es format", async () => {
      const { parseDirectoryPage } = await import("../../src/indexer/seed-scraper");

      const html = `
        <html>
        <body>
          <ul>
            <li><a href="https://site1.com">Site 1</a></li>
            <li><a href="https://site2.net">Site 2</a></li>
          </ul>
        </body>
        </html>
      `;

      const blogs = parseDirectoryPage(html, {
        url: "https://personalsit.es",
        name: "personalsit.es",
        type: "directory",
        languages: ["en"],
      });

      expect(blogs).toHaveLength(2);
    });
  });

  describe("SeedDiscovery", () => {
    test("adds discovered blogs to database", async () => {
      const { SeedDiscovery } = await import("../../src/indexer/seed-discovery");

      // Mock fetch to return test HTML
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("personalsit.es")) {
          return new Response(`
            <html>
            <body>
              <a href="https://discovered-blog-1.com">Blog 1</a>
              <a href="https://discovered-blog-2.net">Blog 2</a>
            </body>
            </html>
          `);
        }
        return new Response("", { status: 404 });
      };

      try {
        const discovery = new SeedDiscovery(db);
        const result = await discovery.discoverFromSource({
          url: "https://personalsit.es",
          name: "personalsit.es",
          type: "directory",
          languages: ["en"],
        });

        expect(result.discovered).toBeGreaterThanOrEqual(2);
        expect(result.added).toBeGreaterThanOrEqual(0); // May be less if already exists

        // Check database has the blogs
        const blogs = db.query("SELECT url FROM blogs WHERE url LIKE '%discovered-blog%'").all() as { url: string }[];
        expect(blogs.length).toBeGreaterThanOrEqual(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("sets language from seed source", async () => {
      const { SeedDiscovery } = await import("../../src/indexer/seed-discovery");

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(`
          <html>
          <body>
            <a href="https://english-blog-test.com">English Blog</a>
          </body>
          </html>
        `);
      };

      try {
        const discovery = new SeedDiscovery(db);
        await discovery.discoverFromSource({
          url: "https://test-webring.com",
          name: "English Webring",
          type: "webring",
          languages: ["en"],
        });

        const blog = db.query("SELECT languages FROM blogs WHERE url = ?").get(
          "https://english-blog-test.com"
        ) as { languages: string } | null;

        expect(blog).not.toBeNull();
        const languages = JSON.parse(blog!.languages);
        expect(languages).toContain("en");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("does not add duplicate blogs", async () => {
      const { SeedDiscovery } = await import("../../src/indexer/seed-discovery");

      // Pre-insert a blog
      db.run(`INSERT INTO blogs (url, name, languages) VALUES (?, ?, ?)`, [
        "https://existing-blog.com",
        "Existing Blog",
        '["en"]',
      ]);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        return new Response(`
          <html>
          <body>
            <a href="https://existing-blog.com">Existing</a>
            <a href="https://new-blog.com">New</a>
          </body>
          </html>
        `);
      };

      try {
        const discovery = new SeedDiscovery(db);
        const result = await discovery.discoverFromSource({
          url: "https://test.com",
          name: "Test",
          type: "directory",
          languages: ["en"],
        });

        expect(result.discovered).toBe(2);
        expect(result.added).toBe(1); // Only new-blog.com added

        // Verify only 2 blogs total (existing + new)
        const count = db.query("SELECT COUNT(*) as count FROM blogs").get() as { count: number };
        expect(count.count).toBe(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("handles fetch errors gracefully", async () => {
      const { SeedDiscovery } = await import("../../src/indexer/seed-discovery");

      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        throw new Error("Network error");
      };

      try {
        const discovery = new SeedDiscovery(db);
        const result = await discovery.discoverFromSource({
          url: "https://failing-source.com",
          name: "Failing Source",
          type: "directory",
          languages: ["en"],
        });

        // Should not throw, just return 0 discovered
        expect(result.discovered).toBe(0);
        expect(result.added).toBe(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("discoverAll", () => {
    test("discovers from all English seed sources", async () => {
      const { SeedDiscovery } = await import("../../src/indexer/seed-discovery");

      let fetchCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: string | URL | Request) => {
        fetchCount++;
        return new Response(`
          <html>
          <body>
            <a href="https://blog-from-${fetchCount}.com">Blog ${fetchCount}</a>
          </body>
          </html>
        `);
      };

      try {
        const discovery = new SeedDiscovery(db);
        const result = await discovery.discoverAll("en");

        // Should have attempted to fetch from English sources
        expect(result.sourcesProcessed).toBeGreaterThan(0);
        expect(result.totalDiscovered).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
