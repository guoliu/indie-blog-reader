import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, unlinkSync } from "fs";

const TEST_DB_PATH = "data/test-ui.db";

describe("UI Rendering", () => {
  let db: Database;
  let app: any;

  beforeAll(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    const { createSchema } = await import("../src/db");
    db = new Database(TEST_DB_PATH);
    createSchema(db);

    // Insert test data
    db.run("INSERT INTO blogs (url, name, ssg) VALUES (?, ?, ?)", [
      "https://blog1.example.com",
      "Test Blog",
      "hexo",
    ]);

    const today = new Date().toISOString().split("T")[0];
    db.run(
      "INSERT INTO articles (blog_id, url, title, description, cover_image, published_at) VALUES (?, ?, ?, ?, ?, ?)",
      [
        1,
        "https://blog1.example.com/post1",
        "Test Article Title",
        "This is a test description for the article",
        "https://example.com/cover.jpg",
        today,
      ]
    );

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

  test("GET / returns HTML page", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("homepage contains article cards", async () => {
    const res = await app.request("/");
    const html = await res.text();

    expect(html).toContain("Test Article Title");
    expect(html).toContain("Test Blog");
    expect(html).toContain("This is a test description");
  });

  test("homepage contains refresh button", async () => {
    const res = await app.request("/");
    const html = await res.text();

    // Should have a refresh button/form
    expect(html).toMatch(/refresh/i);
  });

  test("homepage contains filter tabs", async () => {
    const res = await app.request("/");
    const html = await res.text();

    // Should have filter options
    expect(html).toMatch(/today/i);
    expect(html).toMatch(/comment/i);
  });

  test("homepage includes cover image when available", async () => {
    const res = await app.request("/");
    const html = await res.text();

    expect(html).toContain("https://example.com/cover.jpg");
  });

  test("homepage includes add blog form", async () => {
    const res = await app.request("/");
    const html = await res.text();

    // Should have a form to add new blogs
    expect(html).toMatch(/add.*blog|new.*blog/i);
  });

  test("homepage links to article URLs", async () => {
    const res = await app.request("/");
    const html = await res.text();

    expect(html).toContain("https://blog1.example.com/post1");
  });
});

describe("Static Assets", () => {
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

  test("GET /style.css returns CSS", async () => {
    const res = await app.request("/style.css");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });
});
