/**
 * Migration script for v2 schema changes.
 * Adds new columns and tables for background indexing and multi-language support.
 *
 * Safe to run multiple times - uses IF NOT EXISTS and ignores duplicate column errors.
 */

import { Database } from "bun:sqlite";

const DB_PATH = process.argv[2] || "data/blog-monitor.db";

console.log(`Migrating database: ${DB_PATH}`);

const db = new Database(DB_PATH);

// Helper to safely add column (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
function addColumnIfNotExists(
  table: string,
  column: string,
  definition: string
): void {
  try {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`  Added column: ${table}.${column}`);
  } catch (e: unknown) {
    const error = e as Error;
    if (error.message.includes("duplicate column name")) {
      console.log(`  Column exists: ${table}.${column}`);
    } else {
      throw e;
    }
  }
}

console.log("\n1. Adding new columns to blogs table...");
addColumnIfNotExists("blogs", "languages", 'TEXT DEFAULT \'["zh"]\'');
addColumnIfNotExists("blogs", "error_count", "INTEGER DEFAULT 0");
addColumnIfNotExists("blogs", "last_error", "TEXT");

console.log("\n2. Adding new columns to articles table...");
addColumnIfNotExists("articles", "language", "TEXT");

console.log("\n3. Adding new columns to circles table...");
addColumnIfNotExists("circles", "languages", 'TEXT DEFAULT \'["zh"]\'');

console.log("\n4. Creating crawl_state table...");
db.run(`
  CREATE TABLE IF NOT EXISTS crawl_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    current_blog_id INTEGER,
    last_crawl_at TEXT,
    is_running INTEGER DEFAULT 0
  )
`);
db.run(`INSERT OR IGNORE INTO crawl_state (id) VALUES (1)`);
console.log("  Created crawl_state table");

console.log("\n5. Creating seed_sources table...");
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
console.log("  Created seed_sources table");

console.log("\n6. Creating discovery_queue table...");
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
console.log("  Created discovery_queue table");

console.log("\n7. Creating new indexes...");
db.run(
  "CREATE INDEX IF NOT EXISTS idx_articles_language ON articles(language)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_blogs_last_scraped_at ON blogs(last_scraped_at)"
);
db.run(
  "CREATE INDEX IF NOT EXISTS idx_discovery_queue_priority ON discovery_queue(priority DESC)"
);
console.log("  Created indexes");

console.log("\n8. Verifying migration...");
const tables = db
  .query("SELECT name FROM sqlite_master WHERE type='table'")
  .all() as { name: string }[];
console.log("  Tables:", tables.map((t) => t.name).join(", "));

const blogColumns = db.query("PRAGMA table_info(blogs)").all() as {
  name: string;
}[];
console.log("  blogs columns:", blogColumns.map((c) => c.name).join(", "));

console.log("\nMigration complete!");
