/**
 * Parallel batch indexer for fast blog crawling.
 *
 * Processes blogs in parallel with configurable concurrency,
 * emitting progress events for UI updates.
 */

import type { Database } from "bun:sqlite";
import { fetchRss } from "./rss-fetcher";
import { detectLanguages, detectArticleLanguage } from "./language-detector";
import { scrapeCommentCount } from "./comment-scraper";
import type { Article, Blog } from "./types";

export interface BatchIndexerConfig {
  /** Number of concurrent blog fetches */
  concurrency: number;
  /** Timeout for each RSS fetch in milliseconds */
  fetchTimeoutMs: number;
}

export interface BatchStats {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  newArticlesFound: number;
  startedAt: Date;
  estimatedSecondsRemaining?: number;
  cancelled: boolean;
}

export interface BatchIndexerEvents {
  onProgress?: (stats: BatchStats) => void;
  onBlogStart?: (blog: Blog) => void;
  onBlogComplete?: (blog: Blog, success: boolean) => void;
  onNewArticle?: (article: Article, blog: Blog) => void;
  /** Called when an article has comments (new or updated count) */
  onNewComment?: (article: Article & { comment_count: number }, blog: Blog) => void;
  onError?: (blog: Blog, error: Error) => void;
}

const DEFAULT_CONFIG: BatchIndexerConfig = {
  concurrency: 20,
  fetchTimeoutMs: 10000,
};

export class BatchIndexer {
  private db: Database;
  private config: BatchIndexerConfig;
  private events: BatchIndexerEvents;
  private stats: BatchStats;
  private cancelled: boolean = false;

  constructor(
    db: Database,
    configAndEvents: Partial<BatchIndexerConfig> & BatchIndexerEvents = {}
  ) {
    this.db = db;

    // Separate config from events
    const { onProgress, onBlogStart, onBlogComplete, onNewArticle, onNewComment, onError, ...config } = configAndEvents;

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = { onProgress, onBlogStart, onBlogComplete, onNewArticle, onNewComment, onError };
    this.stats = this.initStats();
  }

  private initStats(): BatchStats {
    return {
      total: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      newArticlesFound: 0,
      startedAt: new Date(),
      cancelled: false,
    };
  }

  /**
   * Run batch indexing for all blogs that need refresh.
   */
  async runBatch(): Promise<BatchStats> {
    this.cancelled = false;
    this.stats = this.initStats();

    // Get all blogs to process
    const blogs = this.getBlogsToProcess();
    this.stats.total = blogs.length;

    console.log(`[BatchIndexer] Starting batch: ${blogs.length} blogs, concurrency: ${this.config.concurrency}`);

    // Process in parallel with concurrency limit using a semaphore pattern
    const semaphore = new Semaphore(this.config.concurrency);
    const promises: Promise<void>[] = [];

    for (const blog of blogs) {
      if (this.cancelled) {
        console.log(`[BatchIndexer] Cancelled, stopping queue`);
        break;
      }

      const promise = semaphore.acquire().then(async (release) => {
        try {
          if (this.cancelled) return;
          await this.processBlog(blog);
        } finally {
          release();
        }
      });

      promises.push(promise);
    }

    // Wait for all in-flight requests to complete
    await Promise.all(promises);

    this.stats.cancelled = this.cancelled;
    console.log(`[BatchIndexer] Batch complete: ${this.stats.processed}/${this.stats.total} processed, ${this.stats.succeeded} succeeded, ${this.stats.failed} failed, ${this.stats.newArticlesFound} new articles`);

    return this.stats;
  }

  /**
   * Cancel the current batch operation.
   */
  cancel(): void {
    this.cancelled = true;
    console.log(`[BatchIndexer] Cancel requested`);
  }

  /**
   * Get current stats.
   */
  getStats(): BatchStats {
    return { ...this.stats };
  }

  private getBlogsToProcess(): (Blog & { last_scraped_at: string | null })[] {
    const blogs = this.db
      .query(`
        SELECT id, url, name, ssg, rss_url, languages, error_count, last_scraped_at
        FROM blogs
        ORDER BY
          CASE WHEN last_scraped_at IS NULL THEN 0 ELSE 1 END,
          last_scraped_at ASC
      `)
      .all() as (Blog & { last_scraped_at: string | null })[];

    return blogs;
  }

  private async processBlog(blog: Blog & { last_scraped_at: string | null }): Promise<void> {
    if (this.events.onBlogStart) {
      this.events.onBlogStart(blog);
    }

    console.log(`[BatchIndexer] Processing: ${blog.url}`);

    let success = false;
    const isFirstScrape = !blog.last_scraped_at;

    try {
      // Detect blog language on first scrape
      if (isFirstScrape) {
        try {
          const homepageHtml = await this.fetchHomepageHtml(blog.url);
          if (homepageHtml) {
            const detectedLanguages = detectLanguages(homepageHtml, blog.url);
            if (detectedLanguages.length > 0) {
              this.updateBlogLanguages(blog.id, detectedLanguages);
            }
          }
        } catch (langError) {
          // Language detection errors are non-fatal
          console.log(`[BatchIndexer] Language detection failed for ${blog.url}: ${langError}`);
        }
      }

      const articles = await fetchRss(
        blog.url,
        blog.ssg || "unknown",
        this.config.fetchTimeoutMs
      );

      const savedResults = this.saveArticles(blog.id, articles);
      const newCount = savedResults.filter(r => r.isNew).length;
      this.stats.newArticlesFound += newCount;
      this.stats.succeeded++;
      success = true;

      // Update blog's last_scraped_at
      this.updateBlogSuccess(blog.id);

      // Process each article - emit events and scrape comments for new articles
      for (const { article, articleId, isNew } of savedResults) {
        // Emit new article event
        if (isNew && this.events.onNewArticle) {
          this.events.onNewArticle(article, blog);
        }

        // Scrape comments for new articles
        if (isNew) {
          try {
            const commentResult = await scrapeCommentCount(
              article.url,
              blog.comment_system,
              this.config.fetchTimeoutMs
            );

            if (commentResult && commentResult.count > 0) {
              const commentChanged = this.saveCommentSnapshot(articleId, commentResult.count);

              // Update blog's comment_system if we detected one
              if (!blog.comment_system && commentResult.system) {
                this.db.run(
                  `UPDATE blogs SET comment_system = ? WHERE id = ?`,
                  [commentResult.system, blog.id]
                );
              }

              // Emit new comment event
              if (commentChanged && this.events.onNewComment) {
                const articleWithComments = {
                  ...article,
                  comment_count: commentResult.count,
                };
                this.events.onNewComment(articleWithComments, blog);
              }
            }
          } catch (commentError) {
            // Comment scraping errors are non-fatal
            console.log(`[BatchIndexer] Comment scrape failed for ${article.url}: ${commentError}`);
          }
        }
      }

      console.log(`[BatchIndexer] Success: ${blog.url} - ${newCount} new articles`);
    } catch (error) {
      this.stats.failed++;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Update blog with error
      this.updateBlogError(blog.id, errorMessage);

      if (this.events.onError) {
        this.events.onError(blog, error instanceof Error ? error : new Error(errorMessage));
      }

      console.log(`[BatchIndexer] Error: ${blog.url} - ${errorMessage}`);
    }

    this.stats.processed++;

    if (this.events.onBlogComplete) {
      this.events.onBlogComplete(blog, success);
    }

    // Calculate estimated time remaining
    this.updateTimeEstimate();

    if (this.events.onProgress) {
      this.events.onProgress(this.getStats());
    }
  }

  private updateTimeEstimate(): void {
    if (this.stats.processed === 0) return;

    const elapsedMs = Date.now() - this.stats.startedAt.getTime();
    const msPerBlog = elapsedMs / this.stats.processed;
    const remainingBlogs = this.stats.total - this.stats.processed;
    this.stats.estimatedSecondsRemaining = Math.round((msPerBlog * remainingBlogs) / 1000);
  }

  /**
   * Save articles to the database.
   * @returns Array of { article, articleId, isNew } for each article
   */
  private saveArticles(blogId: number, articles: Article[]): Array<{
    article: Article;
    articleId: number;
    isNew: boolean;
  }> {
    const results: Array<{ article: Article; articleId: number; isNew: boolean }> = [];

    const insertArticle = this.db.prepare(`
      INSERT OR IGNORE INTO articles (blog_id, url, title, description, cover_image, language, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const getArticleId = this.db.prepare(`
      SELECT id FROM articles WHERE url = ?
    `);

    for (const article of articles) {
      // Detect article language from title and description
      const detectedLanguage = detectArticleLanguage(
        article.title,
        article.description || ""
      );

      const result = insertArticle.run(
        blogId,
        article.url,
        article.title,
        article.description || null,
        article.cover_image || null,
        detectedLanguage,
        article.published_at || null
      );

      const isNew = result.changes > 0;

      // Get the article ID (either newly inserted or existing)
      const row = getArticleId.get(article.url) as { id: number } | null;
      if (row) {
        // Update article with detected language
        const articleWithLang = { ...article, language: detectedLanguage };
        results.push({ article: articleWithLang, articleId: row.id, isNew });
      }
    }

    return results;
  }

  private updateBlogSuccess(blogId: number): void {
    this.db.run(
      `UPDATE blogs SET last_scraped_at = ?, error_count = 0, last_error = NULL WHERE id = ?`,
      [new Date().toISOString(), blogId]
    );
  }

  private updateBlogError(blogId: number, errorMessage: string): void {
    this.db.run(
      `UPDATE blogs SET last_scraped_at = ?, error_count = error_count + 1, last_error = ? WHERE id = ?`,
      [new Date().toISOString(), errorMessage, blogId]
    );
  }

  /**
   * Fetch homepage HTML for language detection.
   */
  private async fetchHomepageHtml(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.fetchTimeoutMs);

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

  /**
   * Update blog languages in the database.
   */
  private updateBlogLanguages(blogId: number, languages: string[]): void {
    this.db.run(
      `UPDATE blogs SET languages = ? WHERE id = ?`,
      [JSON.stringify(languages), blogId]
    );
  }

  /**
   * Save comment snapshot for an article.
   * @returns true if the comment count changed (new or updated)
   */
  private saveCommentSnapshot(articleId: number, commentCount: number): boolean {
    // Get the latest comment count for this article
    const latest = this.db.query(`
      SELECT comment_count FROM comment_snapshots
      WHERE article_id = ?
      ORDER BY snapshot_at DESC
      LIMIT 1
    `).get(articleId) as { comment_count: number } | null;

    // Only save if count changed or this is the first snapshot
    if (!latest || latest.comment_count !== commentCount) {
      this.db.run(
        `INSERT INTO comment_snapshots (article_id, comment_count) VALUES (?, ?)`,
        [articleId, commentCount]
      );
      return true;
    }

    return false;
  }
}

/**
 * Simple semaphore for concurrency control.
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.permits--;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.permits++;
    const next = this.waiting.shift();
    if (next) {
      next();
    }
  }
}
