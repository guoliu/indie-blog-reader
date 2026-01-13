import { Database } from "bun:sqlite";
import { readFileSync, existsSync } from "fs";

export function createSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS blogs (
      id INTEGER PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      name TEXT,
      ssg TEXT,
      comment_system TEXT,
      rss_url TEXT,
      last_scraped_at TEXT,
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
      url TEXT
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

  // Create indexes for common queries
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_blog_id ON articles(blog_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_comment_snapshots_article_id ON comment_snapshots(article_id)");
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
