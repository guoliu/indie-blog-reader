import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { serveStatic } from "hono/bun";
import { createSchema } from "./db";
import { renderHomepage } from "./views/homepage";
import {
  ArticleEventEmitter,
  createSSEStream,
} from "./sse/event-emitter";
import { BatchIndexer, type BatchStats } from "./indexer/batch-indexer";
import { SeedDiscovery } from "./indexer/seed-discovery";
import { detectLanguages } from "./indexer/language-detector";

export interface AppOptions {
  dbPath?: string;
  eventEmitter?: ArticleEventEmitter;
}

// Global batch indexer state
let activeBatchIndexer: BatchIndexer | null = null;

export function createApp(options: AppOptions = {}) {
  const { dbPath = "data/blog-monitor.db", eventEmitter } = options;
  const app = new Hono();
  const db = new Database(dbPath);
  createSchema(db);

  // Serve static files
  app.use("/style.css", serveStatic({ path: "./public/style.css" }));

  // Homepage - Latest articles feed
  // Supports ?lang=zh|en for language filtering
  app.get("/", (c) => {
    const lang = c.req.query("lang"); // Optional language filter

    // Build language filter clause - matches if blog's languages JSON array contains the lang
    const langClause = lang ? `AND b.languages LIKE '%"${lang}"%'` : "";

    const query = `
      SELECT
        a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
        b.name as blog_name, b.url as blog_url, b.languages as blog_languages
      FROM articles a
      JOIN blogs b ON a.blog_id = b.id
      WHERE 1=1
      ${langClause}
      ORDER BY a.published_at DESC
      LIMIT 100
    `;

    const articles = db.query(query).all() as any[];

    const html = renderHomepage(articles, "latest", lang);
    return c.html(html);
  });

  // New Comments feed - separate route showing articles with new comments
  // Supports ?lang=zh|en for language filtering
  app.get("/comments", (c) => {
    const lang = c.req.query("lang"); // Optional language filter

    // Build language filter clause - matches if blog's languages JSON array contains the lang
    const langClause = lang ? `AND b.languages LIKE '%"${lang}"%'` : "";

    const query = `
      SELECT
        a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
        b.name as blog_name, b.url as blog_url, b.languages as blog_languages,
        MAX(cs.snapshot_at) as latest_comment_at,
        (SELECT comment_count FROM comment_snapshots WHERE article_id = a.id ORDER BY snapshot_at DESC LIMIT 1) as comment_count
      FROM articles a
      JOIN blogs b ON a.blog_id = b.id
      JOIN comment_snapshots cs ON a.id = cs.article_id
      WHERE 1=1
      ${langClause}
      GROUP BY a.id
      ORDER BY latest_comment_at DESC
      LIMIT 100
    `;

    const articles = db.query(query).all() as any[];

    const html = renderHomepage(articles, "comments", lang);
    return c.html(html);
  });

  // GET /api/articles - list articles with optional filters
  // Supports ?filter=latest|comments and ?lang=zh|en for language filtering
  app.get("/api/articles", (c) => {
    const filter = c.req.query("filter");
    const lang = c.req.query("lang"); // Optional language filter

    // Build language filter clause - matches if blog's languages JSON array contains the lang
    // e.g., for lang=zh, matches blogs where languages LIKE '%"zh"%'
    const langClause = lang ? `AND b.languages LIKE '%"${lang}"%'` : "";

    let query: string;

    if (filter === "latest") {
      // All articles ordered by published_at DESC
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url, b.languages as blog_languages
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        WHERE 1=1
        ${langClause}
        ORDER BY a.published_at DESC
        LIMIT 100
      `;
    } else if (filter === "comments") {
      // Articles ordered by newest comment (most recent comment first)
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url, b.languages as blog_languages,
          MAX(cs.snapshot_at) as latest_comment_at,
          (SELECT comment_count FROM comment_snapshots WHERE article_id = a.id ORDER BY snapshot_at DESC LIMIT 1) as comment_count
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        JOIN comment_snapshots cs ON a.id = cs.article_id
        WHERE 1=1
        ${langClause}
        GROUP BY a.id
        ORDER BY latest_comment_at DESC
        LIMIT 100
      `;
    } else {
      // Default: all articles ordered by published_at DESC
      query = `
        SELECT
          a.id, a.url, a.title, a.description, a.cover_image, a.published_at,
          b.name as blog_name, b.url as blog_url, b.languages as blog_languages
        FROM articles a
        JOIN blogs b ON a.blog_id = b.id
        WHERE 1=1
        ${langClause}
        ORDER BY a.published_at DESC
        LIMIT 100
      `;
    }

    const articles = db.query(query).all();

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

  // ============================================
  // Batch Indexer API Endpoints
  // ============================================

  // POST /api/batch/start - Start batch indexing
  app.post("/api/batch/start", async (c) => {
    if (activeBatchIndexer) {
      const stats = activeBatchIndexer.getStats();
      if (!stats.cancelled && stats.processed < stats.total) {
        return c.json({
          error: "Batch indexer already running",
          stats,
        }, 409);
      }
    }

    const concurrency = parseInt(c.req.query("concurrency") || "20");
    const timeout = parseInt(c.req.query("timeout") || "10000");

    console.log(`[API] Starting batch indexer: concurrency=${concurrency}, timeout=${timeout}ms`);

    let currentBlog: string | null = null;

    activeBatchIndexer = new BatchIndexer(db, {
      concurrency,
      fetchTimeoutMs: timeout,
      onBlogStart: (blog) => {
        currentBlog = blog.name || blog.url;
      },
      onProgress: (stats) => {
        console.log(`[BatchIndexer] Progress: ${stats.processed}/${stats.total} (${stats.succeeded} ok, ${stats.failed} err, ${stats.newArticlesFound} new)`);
        // Emit progress to SSE clients
        if (eventEmitter) {
          eventEmitter.emitProgress({
            isRunning: stats.processed < stats.total && !stats.cancelled,
            total: stats.total,
            processed: stats.processed,
            newArticlesFound: stats.newArticlesFound,
            errorsEncountered: stats.failed,
            currentBlog: currentBlog,
          });
        }
      },
      onNewArticle: (article, blog) => {
        console.log(`[BatchIndexer] New article: "${article.title}" from ${blog.name || blog.url}`);
        // Emit SSE event if eventEmitter is available
        if (eventEmitter) {
          eventEmitter.emitNewArticle(article, blog);
        }
      },
      onNewComment: (article, blog) => {
        console.log(`[BatchIndexer] Article with comments: "${article.title}" (${article.comment_count} comments)`);
        // Emit SSE event for new comments
        if (eventEmitter) {
          eventEmitter.emitNewComment(article, blog);
        }
      },
      onError: (blog, error) => {
        console.log(`[BatchIndexer] Error for ${blog.url}: ${error.message}`);
      },
    });

    // Start indexing in background
    activeBatchIndexer.runBatch().then((stats) => {
      console.log(`[BatchIndexer] Completed: ${stats.processed}/${stats.total}, ${stats.newArticlesFound} new articles`);
    });

    return c.json({
      status: "started",
      message: "Batch indexer started",
    });
  });

  // GET /api/batch/status - Get batch indexer status
  app.get("/api/batch/status", (c) => {
    if (!activeBatchIndexer) {
      return c.json({
        isRunning: false,
        stats: null,
      });
    }

    const stats = activeBatchIndexer.getStats();
    const isRunning = !stats.cancelled && stats.processed < stats.total;

    return c.json({
      isRunning,
      stats,
    });
  });

  // POST /api/batch/cancel - Cancel batch indexer
  app.post("/api/batch/cancel", (c) => {
    if (!activeBatchIndexer) {
      return c.json({ error: "No batch indexer running" }, 404);
    }

    const stats = activeBatchIndexer.getStats();
    if (stats.cancelled || stats.processed >= stats.total) {
      return c.json({ error: "Batch indexer not running" }, 400);
    }

    console.log(`[API] Cancelling batch indexer`);
    activeBatchIndexer.cancel();

    return c.json({
      status: "cancelled",
      message: "Batch indexer cancellation requested",
    });
  });

  // GET /api/batch/stream - SSE endpoint for batch progress
  app.get("/api/batch/stream", (c) => {
    const concurrency = parseInt(c.req.query("concurrency") || "20");
    const timeout = parseInt(c.req.query("timeout") || "10000");

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendEvent = (type: string, data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        };

        // Check if already running
        if (activeBatchIndexer) {
          const existingStats = activeBatchIndexer.getStats();
          if (!existingStats.cancelled && existingStats.processed < existingStats.total) {
            sendEvent("error", { message: "Batch indexer already running" });
            controller.close();
            return;
          }
        }

        console.log(`[API] Starting streaming batch indexer: concurrency=${concurrency}, timeout=${timeout}ms`);

        const blogLogs: Array<{ url: string; status: string; message?: string }> = [];

        activeBatchIndexer = new BatchIndexer(db, {
          concurrency,
          fetchTimeoutMs: timeout,
          onBlogStart: (blog) => {
            sendEvent("blog_start", { url: blog.url, name: blog.name });
          },
          onBlogComplete: (blog, success) => {
            const logEntry = {
              url: blog.url,
              status: success ? "success" : "error",
            };
            blogLogs.push(logEntry);
            sendEvent("blog_complete", logEntry);
          },
          onProgress: (stats) => {
            sendEvent("progress", {
              total: stats.total,
              processed: stats.processed,
              succeeded: stats.succeeded,
              failed: stats.failed,
              newArticlesFound: stats.newArticlesFound,
              estimatedSecondsRemaining: stats.estimatedSecondsRemaining,
            });
          },
          onNewArticle: (article, blog) => {
            sendEvent("new_article", {
              title: article.title,
              url: article.url,
              blogName: blog.name || blog.url,
            });
            // Also emit to main event emitter
            if (eventEmitter) {
              eventEmitter.emitNewArticle(article, blog);
            }
          },
          onNewComment: (article, blog) => {
            sendEvent("new_comment", {
              title: article.title,
              url: article.url,
              blogName: blog.name || blog.url,
              commentCount: article.comment_count,
            });
            // Also emit to main event emitter
            if (eventEmitter) {
              eventEmitter.emitNewComment(article, blog);
            }
          },
          onError: (blog, error) => {
            sendEvent("blog_error", {
              url: blog.url,
              error: error.message,
            });
          },
        });

        // Send start event
        const totalBlogs = db.query("SELECT COUNT(*) as count FROM blogs").get() as { count: number };
        sendEvent("start", { total: totalBlogs.count, concurrency, timeout });

        try {
          const stats = await activeBatchIndexer.runBatch();
          sendEvent("complete", {
            total: stats.total,
            processed: stats.processed,
            succeeded: stats.succeeded,
            failed: stats.failed,
            newArticlesFound: stats.newArticlesFound,
            cancelled: stats.cancelled,
            durationSeconds: Math.round((Date.now() - stats.startedAt.getTime()) / 1000),
          });
        } catch (error: any) {
          sendEvent("error", { message: error.message || "Batch indexer failed" });
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

  // ============================================
  // Discovery API Endpoints
  // ============================================

  // POST /api/discovery/run - Run seed source discovery
  app.post("/api/discovery/run", async (c) => {
    const language = c.req.query("lang"); // Optional: "en" or "zh"

    console.log(`[API] Running seed discovery${language ? ` (lang=${language})` : ""}`);

    const discovery = new SeedDiscovery(db);
    const result = await discovery.discoverAll(language);

    return c.json({
      status: "completed",
      sourcesProcessed: result.sourcesProcessed,
      totalDiscovered: result.totalDiscovered,
      totalAdded: result.totalAdded,
      errors: result.errors,
    });
  });

  // POST /api/blogs/detect-languages - Re-detect languages for blogs with wrong language
  app.post("/api/blogs/detect-languages", async (c) => {
    const limit = parseInt(c.req.query("limit") || "100");
    const targetLang = c.req.query("from") || "zh"; // Default: re-detect blogs marked as Chinese

    console.log(`[API] Re-detecting languages for up to ${limit} blogs (from=${targetLang})`);

    // Find blogs that may have wrong language (default: all marked as Chinese)
    const blogs = db.query(`
      SELECT id, url FROM blogs
      WHERE languages LIKE ?
      LIMIT ?
    `).all(`%"${targetLang}"%`, limit) as { id: number; url: string }[];

    let processed = 0;
    let updated = 0;

    for (const blog of blogs) {
      try {
        const html = await fetchHomepageHtml(blog.url);
        if (html) {
          const languages = detectLanguages(html, blog.url);
          if (languages.length > 0) {
            db.run(`UPDATE blogs SET languages = ? WHERE id = ?`, [
              JSON.stringify(languages),
              blog.id,
            ]);
            updated++;
          }
        }
        processed++;
      } catch {
        // Skip failed fetches
        processed++;
      }
    }

    console.log(`[API] Language re-detection complete: ${processed} processed, ${updated} updated`);

    return c.json({
      processed,
      updated,
    });
  });

  return { app, db, eventEmitter };
}

/**
 * Fetch homepage HTML for language detection.
 */
async function fetchHomepageHtml(url: string, timeoutMs: number = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IndieBlogReader/2.0)",
        Accept: "text/html",
      },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Ignore errors
  }
  return null;
}
