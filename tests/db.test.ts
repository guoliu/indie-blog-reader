import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";

const TEST_DB_PATH = "data/test-blog-monitor.db";

describe("Database Schema", () => {
  let db: Database;

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
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

  test("createSchema creates all required tables", async () => {
    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);

    createSchema(db);

    // Verify tables exist
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];

    const tableNames = tables.map(t => t.name);

    expect(tableNames).toContain("blogs");
    expect(tableNames).toContain("articles");
    expect(tableNames).toContain("comment_snapshots");
    expect(tableNames).toContain("circles");
    expect(tableNames).toContain("blog_circles");
    expect(tableNames).toContain("friend_links");
  });

  test("blogs table has correct columns", async () => {
    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);

    createSchema(db);

    const columns = db.query("PRAGMA table_info(blogs)").all() as { name: string }[];
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("url");
    expect(columnNames).toContain("name");
    expect(columnNames).toContain("ssg");
    expect(columnNames).toContain("comment_system");
    expect(columnNames).toContain("rss_url");
    expect(columnNames).toContain("last_scraped_at");
    expect(columnNames).toContain("created_at");
  });

  test("articles table has correct columns", async () => {
    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);

    createSchema(db);

    const columns = db.query("PRAGMA table_info(articles)").all() as { name: string }[];
    const columnNames = columns.map(c => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("blog_id");
    expect(columnNames).toContain("url");
    expect(columnNames).toContain("title");
    expect(columnNames).toContain("description");
    expect(columnNames).toContain("cover_image");
    expect(columnNames).toContain("published_at");
    expect(columnNames).toContain("discovered_at");
  });

  test("blog url must be unique", async () => {
    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);

    createSchema(db);

    db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", ["https://example.com", "Example"]);

    expect(() => {
      db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", ["https://example.com", "Example 2"]);
    }).toThrow();
  });

  test("article url must be unique", async () => {
    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);

    createSchema(db);

    db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", ["https://example.com", "Example"]);
    db.run("INSERT INTO articles (blog_id, url, title) VALUES (?, ?, ?)", [1, "https://example.com/post1", "Post 1"]);

    expect(() => {
      db.run("INSERT INTO articles (blog_id, url, title) VALUES (?, ?, ?)", [1, "https://example.com/post1", "Post 1 duplicate"]);
    }).toThrow();
  });
});

describe("Database Migration", () => {
  let db: Database;

  beforeEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
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

  test("migrateFromJsonl imports blogs from blogs.jsonl", async () => {
    const { createSchema, migrateFromJsonl } = await import("../src/db");
    db = new Database(TEST_DB_PATH);

    createSchema(db);

    // Use the actual blogs.jsonl file
    const blogsJsonlPath = "Independent Blog Circles/data/blogs.jsonl";
    await migrateFromJsonl(db, blogsJsonlPath);

    const count = db.query("SELECT COUNT(*) as count FROM blogs").get() as { count: number };

    // Should have imported blogs (there are ~17k in the file)
    expect(count.count).toBeGreaterThan(0);
  });

  test("migrateFromJsonl preserves blog metadata", async () => {
    const { createSchema, migrateFromJsonl } = await import("../src/db");
    db = new Database(TEST_DB_PATH);

    createSchema(db);

    const blogsJsonlPath = "Independent Blog Circles/data/blogs.jsonl";
    await migrateFromJsonl(db, blogsJsonlPath);

    // Check a blog has ssg and comment_system populated
    const blog = db.query("SELECT * FROM blogs WHERE ssg IS NOT NULL AND ssg != 'unknown' LIMIT 1").get() as { ssg: string; comment_system: string } | null;

    expect(blog).not.toBeNull();
    expect(blog!.ssg).toBeTruthy();
  });
});
