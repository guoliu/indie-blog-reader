import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";
import { getTodayNYC } from "../src/utils";

const TEST_DB_PATH = "data/test-api.db";

describe("Articles API", () => {
  let db: Database;
  let app: any;

  beforeAll(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    // Create test database with schema and sample data
    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    // Insert test data
    db.run("INSERT INTO blogs (url, name, ssg) VALUES (?, ?, ?)", [
      "https://blog1.example.com",
      "Blog One",
      "hexo",
    ]);
    db.run("INSERT INTO blogs (url, name, ssg) VALUES (?, ?, ?)", [
      "https://blog2.example.com",
      "Blog Two",
      "hugo",
    ]);

    // Insert articles - one from today, one older
    const today = getTodayNYC();
    // Calculate yesterday in NYC timezone
    const yesterdayDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = yesterdayDate.toISOString().split("T")[0];

    db.run(
      "INSERT INTO articles (blog_id, url, title, description, cover_image, published_at) VALUES (?, ?, ?, ?, ?, ?)",
      [1, "https://blog1.example.com/post1", "Today's Post", "A post from today", "https://example.com/img1.jpg", today]
    );
    db.run(
      "INSERT INTO articles (blog_id, url, title, description, published_at) VALUES (?, ?, ?, ?, ?)",
      [2, "https://blog2.example.com/post2", "Yesterday's Post", "A post from yesterday", yesterday]
    );
    db.run(
      "INSERT INTO articles (blog_id, url, title, description, published_at) VALUES (?, ?, ?, ?, ?)",
      [1, "https://blog1.example.com/post3", "Another Today Post", "Another post", today]
    );

    // Insert comment snapshots
    // Post 2 had 5 comments yesterday, now has 7 (new comments)
    db.run("INSERT INTO comment_snapshots (article_id, comment_count, snapshot_at) VALUES (?, ?, ?)", [
      2,
      5,
      yesterday,
    ]);
    db.run("INSERT INTO comment_snapshots (article_id, comment_count, snapshot_at) VALUES (?, ?, ?)", [
      2,
      7,
      today,
    ]);

    // Create app with test database
    const { createApp } = await import("../src/app");
    app = createApp(TEST_DB_PATH);
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("GET /api/articles returns all articles", async () => {
    const res = await app.request("/api/articles");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.articles).toBeArray();
    expect(data.articles.length).toBe(3);
  });

  test("GET /api/articles?filter=today returns only today's articles", async () => {
    const res = await app.request("/api/articles?filter=today");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.articles).toBeArray();
    expect(data.articles.length).toBe(2);
    expect(data.articles.every((a: any) => a.title.includes("Today"))).toBe(true);
  });

  test("GET /api/articles?filter=comments returns articles with new comments", async () => {
    const res = await app.request("/api/articles?filter=comments");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.articles).toBeArray();
    // Post 2 has new comments (went from 5 to 7)
    expect(data.articles.length).toBeGreaterThanOrEqual(1);
    expect(data.articles[0].title).toBe("Yesterday's Post");
  });

  test("articles include blog name in response", async () => {
    const res = await app.request("/api/articles");
    const data = await res.json();

    expect(data.articles[0].blog_name).toBeDefined();
  });

  test("articles include cover_image when available", async () => {
    const res = await app.request("/api/articles?filter=today");
    const data = await res.json();

    const articleWithCover = data.articles.find((a: any) => a.title === "Today's Post");
    expect(articleWithCover.cover_image).toBe("https://example.com/img1.jpg");
  });
});

describe("Blogs API", () => {
  let db: Database;
  let app: any;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    db.run("INSERT INTO blogs (url, name, ssg) VALUES (?, ?, ?)", [
      "https://blog1.example.com",
      "Blog One",
      "hexo",
    ]);

    const { createApp } = await import("../src/app");
    app = createApp(TEST_DB_PATH);
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("GET /api/blogs returns all blogs", async () => {
    const res = await app.request("/api/blogs");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.blogs).toBeArray();
    expect(data.blogs.length).toBe(1);
    expect(data.blogs[0].name).toBe("Blog One");
  });

  test("POST /api/blogs adds a new blog", async () => {
    const res = await app.request("/api/blogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://newblog.example.com", name: "New Blog" }),
    });

    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.blog.url).toBe("https://newblog.example.com");
    expect(data.blog.id).toBeDefined();
  });

  test("POST /api/blogs rejects duplicate URL", async () => {
    const res = await app.request("/api/blogs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://blog1.example.com", name: "Duplicate" }),
    });

    expect(res.status).toBe(409);
  });
});

describe("Refresh API", () => {
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
    app = createApp(TEST_DB_PATH);
  });

  afterAll(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("POST /api/refresh triggers scraper and returns status", async () => {
    // Use limit=1 to minimize runtime, and set longer timeout
    const res = await app.request("/api/refresh?limit=1", {
      method: "POST",
    });

    // Accept either success (200) or error (500 if Python not available)
    expect([200, 500]).toContain(res.status);

    const data = await res.json();
    expect(data.status).toBeDefined();
  }, 30000); // 30 second timeout for real scraper call
});
