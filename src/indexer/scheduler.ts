/**
 * Background indexer scheduler.
 * Continuously crawls blogs in the background when the server is running.
 */

import type { Database } from "bun:sqlite";
import { fetchRss, parseRssContent } from "./rss-fetcher";
import type { Article, Blog, CrawlState } from "./types";

export interface IndexerConfig {
  /** Delay between blog checks in milliseconds */
  crawlIntervalMs: number;
  /** Minimum hours before re-checking a blog */
  minRecheckIntervalHours: number;
  /** Maximum consecutive errors before increasing backoff */
  maxConsecutiveErrors: number;
  /** Timeout for RSS fetch in milliseconds */
  fetchTimeoutMs: number;
}

export interface IndexerStats {
  isRunning: boolean;
  totalBlogsIndexed: number;
  newArticlesFound: number;
  errorsEncountered: number;
  lastCrawlAt: string | null;
  currentBlogUrl: string | null;
}

export interface IndexerEvents {
  onNewArticle?: (article: Article, blog: Blog) => void;
  onProgress?: (stats: IndexerStats) => void;
  onError?: (error: Error, blog: Blog) => void;
}

const DEFAULT_CONFIG: IndexerConfig = {
  crawlIntervalMs: 5000, // 5 seconds between blogs
  minRecheckIntervalHours: 6, // Don't recheck within 6 hours
  maxConsecutiveErrors: 3,
  fetchTimeoutMs: 10000,
};

export class BlogIndexer {
  private db: Database;
  private config: IndexerConfig;
  private events: IndexerEvents;
  private interval: ReturnType<typeof setInterval> | null = null;
  private stats: IndexerStats;

  constructor(
    db: Database,
    config: Partial<IndexerConfig> = {},
    events: IndexerEvents = {}
  ) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;
    this.stats = {
      isRunning: false,
      totalBlogsIndexed: 0,
      newArticlesFound: 0,
      errorsEncountered: 0,
      lastCrawlAt: null,
      currentBlogUrl: null,
    };
  }

  /**
   * Start background indexing.
   */
  start(): void {
    if (this.interval) return; // Already running

    this.stats.isRunning = true;
    this.updateCrawlState(true);

    // Run immediately, then at interval
    this.crawlNextBlog();
    this.interval = setInterval(
      () => this.crawlNextBlog(),
      this.config.crawlIntervalMs
    );

    console.log(
      `[Indexer] Started with ${this.config.crawlIntervalMs}ms interval`
    );
  }

  /**
   * Stop background indexing.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.stats.isRunning = false;
    this.updateCrawlState(false);

    console.log("[Indexer] Stopped");
  }

  /**
   * Get current indexer statistics.
   */
  getStats(): IndexerStats {
    return { ...this.stats };
  }

  /**
   * Crawl the next blog in the queue.
   */
  private async crawlNextBlog(): Promise<void> {
    const blog = this.getNextBlogToCrawl();

    if (!blog) {
      // No blogs need crawling right now
      return;
    }

    this.stats.currentBlogUrl = blog.url;

    try {
      const articles = await fetchRss(
        blog.url,
        blog.ssg || "unknown",
        this.config.fetchTimeoutMs
      );

      const newCount = this.saveArticles(blog.id, articles);
      this.stats.newArticlesFound += newCount;
      this.stats.totalBlogsIndexed++;

      // Update blog's last_scraped_at and reset error count
      this.updateBlogAfterCrawl(blog.id, true);

      // Emit events for new articles
      for (const article of articles) {
        if (this.events.onNewArticle) {
          this.events.onNewArticle(article, blog);
        }
      }
    } catch (error) {
      this.stats.errorsEncountered++;
      this.updateBlogAfterCrawl(
        blog.id,
        false,
        error instanceof Error ? error.message : "Unknown error"
      );

      if (this.events.onError) {
        this.events.onError(
          error instanceof Error ? error : new Error("Unknown error"),
          blog
        );
      }
    }

    this.stats.lastCrawlAt = new Date().toISOString();
    this.stats.currentBlogUrl = null;

    // Update crawl state
    this.updateCrawlCursor(blog.id);

    // Emit progress
    if (this.events.onProgress) {
      this.events.onProgress(this.getStats());
    }
  }

  /**
   * Get the next blog that needs crawling.
   * Prioritizes blogs that haven't been scraped recently or have never been scraped.
   */
  private getNextBlogToCrawl(): Blog | null {
    const minAgo = new Date(
      Date.now() - this.config.minRecheckIntervalHours * 60 * 60 * 1000
    ).toISOString();

    // Get blogs that:
    // 1. Have never been scraped (NULL last_scraped_at), OR
    // 2. Were scraped more than minRecheckIntervalHours ago
    // Order by: never scraped first, then oldest scraped
    // Skip blogs with too many errors (exponential backoff)
    const blog = this.db
      .query(
        `
      SELECT id, url, name, ssg, comment_system, rss_url, languages,
             last_scraped_at, error_count, last_error
      FROM blogs
      WHERE last_scraped_at IS NULL
         OR last_scraped_at < ?
      ORDER BY
        CASE WHEN last_scraped_at IS NULL THEN 0 ELSE 1 END,
        last_scraped_at ASC
      LIMIT 1
    `
      )
      .get(minAgo) as
      | (Omit<Blog, "languages"> & { languages: string | null })
      | null;

    if (!blog) return null;

    // Parse languages JSON
    return {
      ...blog,
      languages: blog.languages ? JSON.parse(blog.languages) : ["zh"],
    };
  }

  /**
   * Save articles to the database.
   * Returns the number of new articles inserted.
   */
  private saveArticles(blogId: number, articles: Article[]): number {
    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO articles
        (blog_id, url, title, description, cover_image, published_at, language)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    let newCount = 0;

    for (const article of articles) {
      const result = insertStmt.run(
        blogId,
        article.url,
        article.title,
        article.description,
        article.cover_image,
        article.published_at,
        null // Language detection to be added later
      );

      if (result.changes > 0) {
        newCount++;
      }
    }

    return newCount;
  }

  /**
   * Update blog after crawl attempt.
   */
  private updateBlogAfterCrawl(
    blogId: number,
    success: boolean,
    errorMessage?: string
  ): void {
    if (success) {
      this.db.run(
        `
        UPDATE blogs
        SET last_scraped_at = ?, error_count = 0, last_error = NULL
        WHERE id = ?
      `,
        [new Date().toISOString(), blogId]
      );
    } else {
      this.db.run(
        `
        UPDATE blogs
        SET error_count = error_count + 1, last_error = ?
        WHERE id = ?
      `,
        [errorMessage || "Unknown error", blogId]
      );
    }
  }

  /**
   * Update crawl state in database.
   */
  private updateCrawlState(isRunning: boolean): void {
    this.db.run(
      `
      UPDATE crawl_state
      SET is_running = ?, last_crawl_at = ?
      WHERE id = 1
    `,
      [isRunning ? 1 : 0, new Date().toISOString()]
    );
  }

  /**
   * Update crawl cursor position.
   */
  private updateCrawlCursor(blogId: number): void {
    this.db.run(
      `
      UPDATE crawl_state
      SET current_blog_id = ?, last_crawl_at = ?
      WHERE id = 1
    `,
      [blogId, new Date().toISOString()]
    );
  }
}
