import { Database } from "bun:sqlite";
import { readFileSync, existsSync } from "fs";

/**
 * Safely add a column to an existing table.
 * SQLite doesn't support IF NOT EXISTS for ALTER TABLE,
 * so we catch the "duplicate column" error.
 */
function addColumnIfNotExists(
  db: Database,
  table: string,
  column: string,
  definition: string
): void {
  try {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (e: unknown) {
    const error = e as Error;
    // Ignore "duplicate column name" error - column already exists
    if (!error.message.includes("duplicate column name")) {
      throw e;
    }
  }
}

export function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS blogs (
      id INTEGER PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      name TEXT,
      ssg TEXT,
      comment_system TEXT,
      rss_url TEXT,
      languages TEXT DEFAULT '["zh"]',
      last_scraped_at TEXT,
      error_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY,
      blog_id INTEGER REFERENCES blogs(id),
      url TEXT UNIQUE NOT NULL,
      title TEXT,
      description TEXT,
      cover_image TEXT,
      language TEXT,
      published_at TEXT,
      discovered_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS comment_snapshots (
      id INTEGER PRIMARY KEY,
      article_id INTEGER REFERENCES articles(id),
      comment_count INTEGER,
      snapshot_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS circles (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT,
      languages TEXT DEFAULT '["zh"]'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS blog_circles (
      blog_id INTEGER REFERENCES blogs(id),
      circle_id INTEGER REFERENCES circles(id),
      PRIMARY KEY (blog_id, circle_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS friend_links (
      source_blog_id INTEGER REFERENCES blogs(id),
      target_url TEXT,
      discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source_blog_id, target_url)
    )
  `);

  // New tables for background indexing

  // Crawl state - singleton row for tracking crawl position
  db.run(`
    CREATE TABLE IF NOT EXISTS crawl_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      current_blog_id INTEGER,
      last_crawl_at TEXT,
      is_running INTEGER DEFAULT 0
    )
  `);

  // Initialize crawl_state if empty
  db.run(`INSERT OR IGNORE INTO crawl_state (id) VALUES (1)`);

  // Seed sources for discovering new blogs
  db.run(`
    CREATE TABLE IF NOT EXISTS seed_sources (
      id INTEGER PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      name TEXT,
      type TEXT NOT NULL,
      languages TEXT DEFAULT '["zh"]',
      last_scraped_at TEXT,
      member_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Discovery queue for new blogs found via friend links/circles
  db.run(`
    CREATE TABLE IF NOT EXISTS discovery_queue (
      id INTEGER PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      discovered_from_blog_id INTEGER REFERENCES blogs(id),
      discovery_type TEXT,
      priority INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate existing databases: add columns that may be missing from older schemas
  // (CREATE TABLE IF NOT EXISTS doesn't add new columns to existing tables)
  addColumnIfNotExists(db, "blogs", "languages", 'TEXT DEFAULT \'["zh"]\'');
  addColumnIfNotExists(db, "blogs", "error_count", "INTEGER DEFAULT 0");
  addColumnIfNotExists(db, "blogs", "last_error", "TEXT");
  addColumnIfNotExists(db, "articles", "language", "TEXT");
  addColumnIfNotExists(db, "circles", "languages", 'TEXT DEFAULT \'["zh"]\'');

  // Create indexes for common queries (must be after column migration)
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_blog_id ON articles(blog_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_language ON articles(language)");
  db.run("CREATE INDEX IF NOT EXISTS idx_comment_snapshots_article_id ON comment_snapshots(article_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_blogs_last_scraped_at ON blogs(last_scraped_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_discovery_queue_priority ON discovery_queue(priority DESC)");
}

interface BlogJsonl {
  url: string;
  name?: string;
  ssg?: string;
  comment_system?: { type?: string };
  circles?: string[];
}

export async function migrateFromJsonl(db: Database, blogsJsonlPath: string): Promise<void> {
  if (!existsSync(blogsJsonlPath)) {
    throw new Error(`File not found: ${blogsJsonlPath}`);
  }

  const content = readFileSync(blogsJsonlPath, "utf-8");
  const lines = content.trim().split("\n");

  const insertBlog = db.prepare(`
    INSERT OR IGNORE INTO blogs (url, name, ssg, comment_system)
    VALUES (?, ?, ?, ?)
  `);

  db.run("BEGIN TRANSACTION");

  try {
    for (const line of lines) {
      if (!line.trim()) continue;

      const blog: BlogJsonl = JSON.parse(line);
      const commentSystem = blog.comment_system?.type || null;

      insertBlog.run(
        blog.url,
        blog.name || null,
        blog.ssg || null,
        commentSystem
      );
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }
}

export function getDatabase(dbPath: string = "data/blog-monitor.db"): Database {
  const db = new Database(dbPath);
  createSchema(db);
  return db;
}
