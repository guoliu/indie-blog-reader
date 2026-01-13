import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { serveStatic } from "hono/bun";
import { createSchema } from "./db";
import { renderHomepage } from "./views/homepage";

export function createApp(dbPath: string = "data/blog-monitor.db") {
  const app = new Hono();
  const db = new Database(dbPath);
  createSchema(db);

  // Serve static files
  app.use("/style.css", serveStatic({ path: "./public/style.css" }));

  // Homepage - render HTML with articles
  app.get("/", (c) => {
    const filter = c.req.query("filter") || "today";
    const today = new Date().toISOString().split("T")[0];

    let query: string;
    let params: any[] = [];

    if (filter === "comments") {
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        JOIN comment_snapshots latest ON a.id = latest.article_id
        LEFT JOIN comment_snapshots prev ON a.id = prev.article_id
          AND prev.snapshot_at < latest.snapshot_at
        WHERE latest.snapshot_at LIKE ?
          AND (prev.comment_count IS NULL OR latest.comment_count > prev.comment_count)
        GROUP BY a.id
        ORDER BY a.published_at DESC
      `;
      params = [`${today}%`];
    } else {
      // Default: today's articles
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        WHERE a.published_at LIKE ?
        ORDER BY a.published_at DESC
      `;
      params = [`${today}%`];
    }

    const articles = db.query(query).all(...params) as any[];

    const html = renderHomepage(articles, filter);
    return c.html(html);
  });

  // GET /api/articles - list articles with optional filters
  app.get("/api/articles", (c) => {
    const filter = c.req.query("filter");
    const today = new Date().toISOString().split("T")[0];

    let query: string;
    let params: any[] = [];

    if (filter === "today") {
      // Articles published today
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        WHERE a.published_at LIKE ?
        ORDER BY a.published_at DESC
      `;
      params = [`${today}%`];
    } else if (filter === "comments") {
      // Articles with new comments today
      // Compare latest snapshot to previous snapshot
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url,
          latest.comment_count as current_comments,
          prev.comment_count as previous_comments
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        JOIN comment_snapshots latest ON a.id = latest.article_id
        LEFT JOIN comment_snapshots prev ON a.id = prev.article_id
          AND prev.snapshot_at < latest.snapshot_at
        WHERE latest.snapshot_at LIKE ?
          AND (prev.comment_count IS NULL OR latest.comment_count > prev.comment_count)
        GROUP BY a.id
        HAVING latest.snapshot_at = MAX(latest.snapshot_at)
        ORDER BY (latest.comment_count - COALESCE(prev.comment_count, 0)) DESC
      `;
      params = [`${today}%`];
    } else {
      // All articles
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        ORDER BY a.published_at DESC
      `;
    }

    const articles = db.query(query).all(...params);

    return c.json({ articles });
  });

  // GET /api/blogs - list all blogs
  app.get("/api/blogs", (c) => {
    const blogs = db
      .query(
        `SELECT id, url, name, ssg, comment_system, rss_url, last_scraped_at, created_at
         FROM blogs
         ORDER BY name`
      )
      .all();

    return c.json({ blogs });
  });

  // POST /api/blogs - add a new blog
  app.post("/api/blogs", async (c) => {
    const body = await c.req.json();
    const { url, name } = body;

    if (!url) {
      return c.json({ error: "URL is required" }, 400);
    }

    try {
      const result = db.run(
        "INSERT INTO blogs (url, name) VALUES (?, ?)",
        [url, name || null]
      );

      const blog = db
        .query("SELECT * FROM blogs WHERE id = ?")
        .get(result.lastInsertRowid);

      return c.json({ blog }, 201);
    } catch (error: any) {
      if (error.message?.includes("UNIQUE constraint")) {
        return c.json({ error: "Blog with this URL already exists" }, 409);
      }
      throw error;
    }
  });

  // POST /api/refresh - trigger the Python scraper
  app.post("/api/refresh", async (c) => {
    // For now, just return a status - actual scraper integration comes later
    // In a full implementation, this would spawn a Python process
    return c.json({
      status: "refresh_started",
      message: "Scraper triggered (not yet implemented)",
    });
  });

  return app;
}
