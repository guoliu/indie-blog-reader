import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync, mkdirSync } from "fs";

const TEST_DB_PATH = "data/test-db-v2.db";

/**
 * Tests for v2 schema additions:
 * - New columns on blogs table (etag, last_modified, crawl_tier, next_crawl_at, etc.)
 * - New site_relationships table
 * - New protocol/fingerprint columns
 */
describe("Database Schema V2", () => {
  beforeEach(() => {
    if (!existsSync("data")) {
      mkdirSync("data", { recursive: true });
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("blogs table v2 columns", () => {
    test("has etag column for conditional HTTP", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      // Insert a blog with etag
      db.run(`
        INSERT INTO blogs (url, etag) VALUES ('https://example.com', '"abc123"')
      `);

      const row = db.query("SELECT etag FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { etag: string };

      expect(row.etag).toBe('"abc123"');
      db.close();
    });

    test("has last_modified column for conditional HTTP", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`
        INSERT INTO blogs (url, last_modified)
        VALUES ('https://example.com', 'Wed, 15 Jan 2025 10:00:00 GMT')
      `);

      const row = db.query("SELECT last_modified FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { last_modified: string };

      expect(row.last_modified).toBe("Wed, 15 Jan 2025 10:00:00 GMT");
      db.close();
    });

    test("has crawl_tier column", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`
        INSERT INTO blogs (url, crawl_tier) VALUES ('https://example.com', 'active')
      `);

      const row = db.query("SELECT crawl_tier FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { crawl_tier: string };

      expect(row.crawl_tier).toBe("active");
      db.close();
    });

    test("crawl_tier defaults to normal", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`INSERT INTO blogs (url) VALUES ('https://example.com')`);

      const row = db.query("SELECT crawl_tier FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { crawl_tier: string };

      expect(row.crawl_tier).toBe("normal");
      db.close();
    });

    test("has next_crawl_at column", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      const nextCrawl = Date.now() + 3600000;
      db.run(`
        INSERT INTO blogs (url, next_crawl_at) VALUES ('https://example.com', ?)
      `, [nextCrawl]);

      const row = db.query("SELECT next_crawl_at FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { next_crawl_at: number };

      expect(row.next_crawl_at).toBe(nextCrawl);
      db.close();
    });

    test("has theme column for fingerprinting", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`
        INSERT INTO blogs (url, theme) VALUES ('https://example.com', 'butterfly')
      `);

      const row = db.query("SELECT theme FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { theme: string };

      expect(row.theme).toBe("butterfly");
      db.close();
    });

    test("has trust_score column", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`
        INSERT INTO blogs (url, trust_score) VALUES ('https://example.com', 0.85)
      `);

      const row = db.query("SELECT trust_score FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { trust_score: number };

      expect(row.trust_score).toBe(0.85);
      db.close();
    });

    test("trust_score defaults to 0.5", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`INSERT INTO blogs (url) VALUES ('https://example.com')`);

      const row = db.query("SELECT trust_score FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { trust_score: number };

      expect(row.trust_score).toBe(0.5);
      db.close();
    });

    test("has hop_count column", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`
        INSERT INTO blogs (url, hop_count) VALUES ('https://example.com', 2)
      `);

      const row = db.query("SELECT hop_count FROM blogs WHERE url = ?").get(
        "https://example.com"
      ) as { hop_count: number };

      expect(row.hop_count).toBe(2);
      db.close();
    });

    test("has protocol detection columns", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`
        INSERT INTO blogs (url, has_opml, opml_url, has_webmention, webmention_endpoint, has_microformats)
        VALUES ('https://example.com', 1, '/blogroll.opml', 1, '/webmention', 1)
      `);

      const row = db.query(`
        SELECT has_opml, opml_url, has_webmention, webmention_endpoint, has_microformats
        FROM blogs WHERE url = ?
      `).get("https://example.com") as {
        has_opml: number;
        opml_url: string;
        has_webmention: number;
        webmention_endpoint: string;
        has_microformats: number;
      };

      expect(row.has_opml).toBe(1);
      expect(row.opml_url).toBe("/blogroll.opml");
      expect(row.has_webmention).toBe(1);
      expect(row.webmention_endpoint).toBe("/webmention");
      expect(row.has_microformats).toBe(1);
      db.close();
    });
  });

  describe("site_relationships table", () => {
    test("table exists after schema creation", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='site_relationships'")
        .all();

      expect(tables).toHaveLength(1);
      db.close();
    });

    test("can insert relationship", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      // Insert source blog first
      db.run(`INSERT INTO blogs (url) VALUES ('https://source.com')`);
      const sourceBlog = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://source.com"
      ) as { id: number };

      // Insert relationship
      db.run(`
        INSERT INTO site_relationships (source_site_id, target_url, relationship_type, discovery_method, confidence)
        VALUES (?, 'https://target.com', 'friend_link', 'opml', 0.95)
      `, [sourceBlog.id]);

      const rel = db.query(`
        SELECT * FROM site_relationships WHERE source_site_id = ?
      `).get(sourceBlog.id) as {
        source_site_id: number;
        target_url: string;
        relationship_type: string;
        discovery_method: string;
        confidence: number;
      };

      expect(rel.target_url).toBe("https://target.com");
      expect(rel.relationship_type).toBe("friend_link");
      expect(rel.discovery_method).toBe("opml");
      expect(rel.confidence).toBe(0.95);
      db.close();
    });

    test("has unique constraint on source_site_id + target_url + relationship_type", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`INSERT INTO blogs (url) VALUES ('https://source.com')`);
      const sourceBlog = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://source.com"
      ) as { id: number };

      // First insert should succeed
      db.run(`
        INSERT INTO site_relationships (source_site_id, target_url, relationship_type)
        VALUES (?, 'https://target.com', 'friend_link')
      `, [sourceBlog.id]);

      // Duplicate should fail
      expect(() => {
        db.run(`
          INSERT INTO site_relationships (source_site_id, target_url, relationship_type)
          VALUES (?, 'https://target.com', 'friend_link')
        `, [sourceBlog.id]);
      }).toThrow();

      db.close();
    });

    test("allows same target with different relationship types", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`INSERT INTO blogs (url) VALUES ('https://source.com')`);
      const sourceBlog = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://source.com"
      ) as { id: number };

      // Insert friend_link
      db.run(`
        INSERT INTO site_relationships (source_site_id, target_url, relationship_type)
        VALUES (?, 'https://target.com', 'friend_link')
      `, [sourceBlog.id]);

      // Insert webmention (different type) should succeed
      db.run(`
        INSERT INTO site_relationships (source_site_id, target_url, relationship_type)
        VALUES (?, 'https://target.com', 'webmention')
      `, [sourceBlog.id]);

      const count = db.query(`
        SELECT COUNT(*) as count FROM site_relationships WHERE source_site_id = ?
      `).get(sourceBlog.id) as { count: number };

      expect(count.count).toBe(2);
      db.close();
    });

    test("has discovered_at and last_seen_at timestamps", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      db.run(`INSERT INTO blogs (url) VALUES ('https://source.com')`);
      const sourceBlog = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://source.com"
      ) as { id: number };

      db.run(`
        INSERT INTO site_relationships (source_site_id, target_url, relationship_type)
        VALUES (?, 'https://target.com', 'friend_link')
      `, [sourceBlog.id]);

      const rel = db.query(`
        SELECT discovered_at, last_seen_at FROM site_relationships WHERE source_site_id = ?
      `).get(sourceBlog.id) as { discovered_at: number; last_seen_at: number };

      expect(rel.discovered_at).toBeDefined();
      expect(rel.last_seen_at).toBeDefined();
      db.close();
    });
  });

  describe("indexes", () => {
    test("has index on blogs.next_crawl_at for scheduler queries", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      const indexes = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_blogs_next_crawl_at'")
        .all();

      expect(indexes).toHaveLength(1);
      db.close();
    });

    test("has index on blogs.crawl_tier", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      const indexes = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_blogs_crawl_tier'")
        .all();

      expect(indexes).toHaveLength(1);
      db.close();
    });

    test("has index on site_relationships.source_site_id", async () => {
      const { createSchema } = await import("../src/db");
      const db = new Database(TEST_DB_PATH);
      createSchema(db);

      const indexes = db
        .query("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_relationships_source'")
        .all();

      expect(indexes).toHaveLength(1);
      db.close();
    });
  });
});
