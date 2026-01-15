/**
 * Script to run English seed discovery and verify results.
 *
 * Usage: bun scripts/run-english-discovery.ts
 */

import { Database } from "bun:sqlite";
import { SeedDiscovery } from "../src/indexer/seed-discovery";
import { createSchema } from "../src/db";

const DB_PATH = "data/blog-monitor.db";

// Ensure data directory exists
const fs = await import("fs");
if (!fs.existsSync("data")) {
  fs.mkdirSync("data", { recursive: true });
}

const db = new Database(DB_PATH);
createSchema(db);

console.log("Running English seed discovery...\n");

const discovery = new SeedDiscovery(db, 15000);
const result = await discovery.discoverAll("en");

console.log("\n=== Results ===");
console.log(`Sources processed: ${result.sourcesProcessed}`);
console.log(`Total discovered: ${result.totalDiscovered}`);
console.log(`Total added: ${result.totalAdded}`);
console.log(`Errors: ${result.errors}`);

// Verify results
const count = db.query(
  "SELECT COUNT(*) as count FROM blogs WHERE languages LIKE '%en%'"
).get() as { count: number };

console.log(`\nEnglish blogs in database: ${count.count}`);

// Show sample blogs
console.log("\n=== Sample English blogs ===");
const samples = db.query(
  "SELECT url, name FROM blogs WHERE languages LIKE '%en%' ORDER BY RANDOM() LIMIT 10"
).all() as { url: string; name: string | null }[];

for (const blog of samples) {
  console.log(`  ${blog.name || "(no name)"}: ${blog.url}`);
}

db.close();
