import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { serveStatic } from "hono/bun";
import { createSchema } from "./db";
import { renderHomepage } from "./views/homepage";
import { getTodayNYC } from "./utils";
import {
  ArticleEventEmitter,
  createSSEStream,
} from "./sse/event-emitter";

export interface AppOptions {
  dbPath?: string;
  eventEmitter?: ArticleEventEmitter;
}

export function createApp(options: AppOptions = {}) {
  const { dbPath = "data/blog-monitor.db", eventEmitter } = options;
  const app = new Hono();
  const db = new Database(dbPath);
  createSchema(db);

  // Serve static files
  app.use("/style.css", serveStatic({ path: "./public/style.css" }));

  // Homepage - render HTML with articles
  // Supports ?filter=today|comments and ?lang=zh|en for language filtering
  app.get("/", (c) => {
    const filter = c.req.query("filter") || "today";
    const lang = c.req.query("lang"); // Optional language filter
    const today = getTodayNYC();

    // Build language filter clause - matches if blog's languages JSON array contains the lang
    const langClause = lang ? `AND b.languages LIKE '%"${lang}"%'` : "";

    let query: string;
    let params: any[] = [];

    if (filter === "comments") {
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url, b.languages as blog_languages
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        JOIN comment_snapshots latest ON a.id = latest.article_id
        LEFT JOIN comment_snapshots prev ON a.id = prev.article_id
          AND prev.snapshot_at < latest.snapshot_at
        WHERE latest.snapshot_at LIKE ?
          ${langClause}
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
          b.name as blog_name, b.url as blog_url, b.languages as blog_languages
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        WHERE a.published_at LIKE ?
        ${langClause}
        ORDER BY a.published_at DESC
      `;
      params = [`${today}%`];
    }

    const articles = db.query(query).all(...params) as any[];

    const html = renderHomepage(articles, filter, lang);
    return c.html(html);
  });

  // GET /api/articles - list articles with optional filters
  // Supports ?filter=today|comments and ?lang=zh|en for language filtering
  app.get("/api/articles", (c) => {
    const filter = c.req.query("filter");
    const lang = c.req.query("lang"); // Optional language filter
    const today = getTodayNYC();

    // Build language filter clause - matches if blog's languages JSON array contains the lang
    // e.g., for lang=zh, matches blogs where languages LIKE '%"zh"%'
    const langClause = lang ? `AND b.languages LIKE '%"${lang}"%'` : "";

    let query: string;
    let params: any[] = [];

    if (filter === "today") {
      // Articles published today
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url, b.languages as blog_languages
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        WHERE a.published_at LIKE ?
        ${langClause}
        ORDER BY a.published_at DESC
      `;
      params = [`${today}%`];
    } else if (filter === "comments") {
      // Articles with new comments today
      // Compare latest snapshot to previous snapshot
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url, b.languages as blog_languages,
          latest.comment_count as current_comments,
          prev.comment_count as previous_comments
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        JOIN comment_snapshots latest ON a.id = latest.article_id
        LEFT JOIN comment_snapshots prev ON a.id = prev.article_id
          AND prev.snapshot_at < latest.snapshot_at
        WHERE latest.snapshot_at LIKE ?
          ${langClause}
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
          b.name as blog_name, b.url as blog_url, b.languages as blog_languages
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        WHERE 1=1
        ${langClause}
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
    const limit = parseInt(c.req.query("limit") || "100");

    try {
      // Spawn Python scraper process
      const proc = Bun.spawn(["python3", "scraper/main.py", "refresh", "--limit", String(limit)], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return c.json({
          status: "error",
          message: stderr || "Scraper failed",
        }, 500);
      }

      // Parse results from output
      const newArticlesMatch = output.match(/New articles: (\d+)/);
      const blogsScrapedMatch = output.match(/Blogs scraped: (\d+)/);

      return c.json({
        status: "success",
        blogs_scraped: blogsScrapedMatch?.[1] ? parseInt(blogsScrapedMatch[1]) : 0,
        new_articles: newArticlesMatch?.[1] ? parseInt(newArticlesMatch[1]) : 0,
        message: output,
      });
    } catch (error: any) {
      return c.json({
        status: "error",
        message: error.message || "Failed to run scraper",
      }, 500);
    }
  });

  // GET /api/events - SSE endpoint for real-time article updates
  app.get("/api/events", (c) => {
    if (!eventEmitter) {
      return c.json({ error: "Event streaming not available" }, 503);
    }

    // Optional language filter: /api/events?lang=zh or /api/events?lang=en
    const language = c.req.query("lang") || undefined;

    return createSSEStream(eventEmitter, language);
  });

  // GET /api/indexer/status - get current indexer status
  app.get("/api/indexer/status", (c) => {
    const state = db
      .query("SELECT * FROM crawl_state WHERE id = 1")
      .get() as {
      current_blog_id: number | null;
      last_crawl_at: string | null;
      is_running: number;
    } | null;

    if (!state) {
      return c.json({
        isRunning: false,
        currentBlogId: null,
        lastCrawlAt: null,
      });
    }

    return c.json({
      isRunning: state.is_running === 1,
      currentBlogId: state.current_blog_id,
      lastCrawlAt: state.last_crawl_at,
    });
  });

  // GET /api/refresh/stream - SSE endpoint for streaming progress
  app.get("/api/refresh/stream", async (c) => {
    const limit = parseInt(c.req.query("limit") || "100");

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        // Send start event
        sendEvent({ type: "start", total: limit, current: 0, newArticles: 0 });

        try {
          // Spawn Python scraper with progress output
          const proc = Bun.spawn(
            ["python3", "scraper/main.py", "refresh", "--limit", String(limit), "--progress"],
            {
              cwd: process.cwd(),
              stdout: "pipe",
              stderr: "pipe",
            }
          );

          // Read stdout line by line for progress updates
          const reader = proc.stdout.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let lastProgress = { current: 0, newArticles: 0 };

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              // Parse progress output from Python: "PROGRESS: 5/100 blogs, 3 new articles"
              const progressMatch = line.match(/PROGRESS: (\d+)\/(\d+) blogs?, (\d+) new articles?/);
              if (progressMatch?.[1] && progressMatch?.[2] && progressMatch?.[3]) {
                lastProgress = {
                  current: parseInt(progressMatch[1]),
                  newArticles: parseInt(progressMatch[3]),
                };
                sendEvent({
                  type: "progress",
                  total: parseInt(progressMatch[2]),
                  current: lastProgress.current,
                  newArticles: lastProgress.newArticles,
                });
              }
            }
          }

          const exitCode = await proc.exited;
          const stderr = await new Response(proc.stderr).text();

          if (exitCode !== 0) {
            sendEvent({ type: "error", message: stderr || "Scraper failed" });
          } else {
            sendEvent({
              type: "complete",
              total: limit,
              current: lastProgress.current,
              newArticles: lastProgress.newArticles,
            });
          }
        } catch (error: any) {
          sendEvent({ type: "error", message: error.message || "Failed to run scraper" });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  });

  return { app, db, eventEmitter };
}
