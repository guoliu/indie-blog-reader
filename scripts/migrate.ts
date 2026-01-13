import { Database } from "bun:sqlite";
import { createSchema, migrateFromJsonl } from "../src/db";
import { existsSync } from "fs";

const DB_PATH = "data/blog-monitor.db";
const BLOGS_JSONL = "Independent Blog Circles/data/blogs.jsonl";

async function main() {
  console.log("Starting migration...");

  // Create data directory if needed
  if (!existsSync("data")) {
    await Bun.$`mkdir -p data`;
  }

  // Create database and schema
  const db = new Database(DB_PATH);
  console.log("Creating schema...");
  createSchema(db);

  // Migrate blogs from JSONL
  if (existsSync(BLOGS_JSONL)) {
    console.log(`Migrating blogs from ${BLOGS_JSONL}...`);
    await migrateFromJsonl(db, BLOGS_JSONL);

    const count = db.query("SELECT COUNT(*) as count FROM blogs").get() as { count: number };
    console.log(`Migrated ${count.count} blogs.`);
  } else {
    console.log(`Warning: ${BLOGS_JSONL} not found. Skipping blog migration.`);
  }

  db.close();
  console.log("Migration complete!");
}

main().catch(console.error);
