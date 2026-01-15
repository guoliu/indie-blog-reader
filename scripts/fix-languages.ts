#!/usr/bin/env bun
/**
 * Migration script to fix blog and article languages.
 *
 * Fixes:
 * 1. Re-detects languages for blogs that were scraped before language detection was added
 * 2. Updates article languages for existing articles with NULL language
 */

import { Database } from "bun:sqlite";
import { detectLanguages, detectArticleLanguage } from "../src/indexer/language-detector";

const DB_PATH = "data/blog-monitor.db";
const BATCH_SIZE = 100;
const TIMEOUT_MS = 10000;

async function fetchHomepageHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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

async function fixBlogLanguages(db: Database): Promise<{ processed: number; updated: number }> {
  console.log("\n=== Fixing Blog Languages ===\n");

  // Get blogs that have been scraped (have last_scraped_at) and still have default ["zh"]
  const blogs = db.query(`
    SELECT id, url, name, languages
    FROM blogs
    WHERE last_scraped_at IS NOT NULL
      AND languages = '["zh"]'
    ORDER BY id
  `).all() as { id: number; url: string; name: string | null; languages: string }[];

  console.log(`Found ${blogs.length} blogs to check for language re-detection`);

  let processed = 0;
  let updated = 0;

  for (const blog of blogs) {
    try {
      const html = await fetchHomepageHtml(blog.url);
      if (html) {
        const detectedLanguages = detectLanguages(html, blog.url);

        // Only update if we detected something different from default
        if (detectedLanguages.length > 0 && JSON.stringify(detectedLanguages) !== '["zh"]') {
          db.run(`UPDATE blogs SET languages = ? WHERE id = ?`, [
            JSON.stringify(detectedLanguages),
            blog.id,
          ]);
          updated++;
          console.log(`  Updated: ${blog.name || blog.url} -> ${JSON.stringify(detectedLanguages)}`);
        }
      }
      processed++;

      if (processed % 100 === 0) {
        console.log(`  Progress: ${processed}/${blogs.length} (${updated} updated)`);
      }
    } catch (error) {
      console.log(`  Error for ${blog.url}: ${error}`);
      processed++;
    }
  }

  return { processed, updated };
}

async function fixArticleLanguages(db: Database): Promise<{ processed: number; updated: number }> {
  console.log("\n=== Fixing Article Languages ===\n");

  // Count articles with NULL language
  const countResult = db.query(`SELECT COUNT(*) as count FROM articles WHERE language IS NULL`).get() as { count: number };
  console.log(`Found ${countResult.count} articles with NULL language`);

  let processed = 0;
  let updated = 0;
  let offset = 0;

  const updateStmt = db.prepare(`UPDATE articles SET language = ? WHERE id = ?`);

  while (true) {
    const articles = db.query(`
      SELECT id, title, description
      FROM articles
      WHERE language IS NULL
      LIMIT ?
      OFFSET ?
    `).all(BATCH_SIZE, offset) as { id: number; title: string; description: string | null }[];

    if (articles.length === 0) break;

    for (const article of articles) {
      const detectedLanguage = detectArticleLanguage(
        article.title,
        article.description || ""
      );

      updateStmt.run(detectedLanguage, article.id);
      updated++;
    }

    processed += articles.length;
    offset += BATCH_SIZE;

    if (processed % 10000 === 0) {
      console.log(`  Progress: ${processed}/${countResult.count} articles`);
    }
  }

  return { processed, updated };
}

async function main() {
  console.log("Opening database:", DB_PATH);
  const db = new Database(DB_PATH);

  try {
    // Show current state
    const blogStats = db.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN last_scraped_at IS NOT NULL THEN 1 ELSE 0 END) as scraped,
        SUM(CASE WHEN languages = '["zh"]' THEN 1 ELSE 0 END) as chinese_only
      FROM blogs
    `).get() as { total: number; scraped: number; chinese_only: number };

    const articleStats = db.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN language IS NULL THEN 1 ELSE 0 END) as null_lang
      FROM articles
    `).get() as { total: number; null_lang: number };

    console.log("\n=== Current State ===");
    console.log(`Blogs: ${blogStats.total} total, ${blogStats.scraped} scraped, ${blogStats.chinese_only} marked as Chinese-only`);
    console.log(`Articles: ${articleStats.total} total, ${articleStats.null_lang} with NULL language`);

    // Fix blog languages
    const blogResult = await fixBlogLanguages(db);
    console.log(`\nBlog fix complete: ${blogResult.processed} processed, ${blogResult.updated} updated`);

    // Fix article languages
    const articleResult = await fixArticleLanguages(db);
    console.log(`\nArticle fix complete: ${articleResult.processed} processed, ${articleResult.updated} updated`);

    // Show new state
    const newBlogStats = db.query(`
      SELECT languages, COUNT(*) as count
      FROM blogs
      GROUP BY languages
      ORDER BY count DESC
      LIMIT 10
    `).all() as { languages: string; count: number }[];

    const newArticleStats = db.query(`
      SELECT language, COUNT(*) as count
      FROM articles
      GROUP BY language
      ORDER BY count DESC
      LIMIT 10
    `).all() as { language: string | null; count: number }[];

    console.log("\n=== New State ===");
    console.log("\nBlog languages:");
    for (const row of newBlogStats) {
      console.log(`  ${row.languages}: ${row.count}`);
    }

    console.log("\nArticle languages:");
    for (const row of newArticleStats) {
      console.log(`  ${row.language || "NULL"}: ${row.count}`);
    }

  } finally {
    db.close();
  }
}

main().catch(console.error);
