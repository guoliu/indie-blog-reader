/**
 * Seed discovery runner for discovering new indie blogs.
 *
 * Uses seed sources (webrings, directories, etc.) to discover
 * and add new blogs to the database.
 */

import type { Database } from "bun:sqlite";
import { getSeedsByLanguage } from "../seeds/sources";
import { scrapeSeedSource, type ScrapedBlog } from "./seed-scraper";
import type { SeedSource } from "./types";

export interface DiscoveryResult {
  discovered: number;
  added: number;
}

export interface DiscoverAllResult {
  sourcesProcessed: number;
  totalDiscovered: number;
  totalAdded: number;
  errors: number;
}

export class SeedDiscovery {
  private db: Database;
  private timeoutMs: number;

  constructor(db: Database, timeoutMs: number = 10000) {
    this.db = db;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Discover blogs from a single seed source.
   */
  async discoverFromSource(source: SeedSource): Promise<DiscoveryResult> {
    try {
      const blogs = await scrapeSeedSource(source, this.timeoutMs);
      let added = 0;

      for (const blog of blogs) {
        if (this.addBlogIfNew(blog, source.languages)) {
          added++;
        }
      }

      console.log(`[SeedDiscovery] ${source.name}: discovered ${blogs.length}, added ${added}`);

      return {
        discovered: blogs.length,
        added,
      };
    } catch (error) {
      console.error(`[SeedDiscovery] Error scraping ${source.name}: ${error}`);
      return {
        discovered: 0,
        added: 0,
      };
    }
  }

  /**
   * Discover blogs from all seed sources for a given language.
   */
  async discoverAll(language?: string): Promise<DiscoverAllResult> {
    const sources = getSeedsByLanguage(language);
    let sourcesProcessed = 0;
    let totalDiscovered = 0;
    let totalAdded = 0;
    let errors = 0;

    console.log(`[SeedDiscovery] Starting discovery from ${sources.length} sources${language ? ` (lang=${language})` : ""}`);

    for (const source of sources) {
      try {
        const result = await this.discoverFromSource(source);
        sourcesProcessed++;
        totalDiscovered += result.discovered;
        totalAdded += result.added;
      } catch {
        errors++;
      }
    }

    console.log(`[SeedDiscovery] Complete: ${sourcesProcessed} sources, ${totalDiscovered} discovered, ${totalAdded} added`);

    return {
      sourcesProcessed,
      totalDiscovered,
      totalAdded,
      errors,
    };
  }

  /**
   * Add a blog to the database if it doesn't already exist.
   * Returns true if added, false if already exists.
   */
  private addBlogIfNew(blog: ScrapedBlog, languages: string[]): boolean {
    try {
      const result = this.db.run(
        `INSERT OR IGNORE INTO blogs (url, name, languages) VALUES (?, ?, ?)`,
        [blog.url, blog.name || null, JSON.stringify(languages)]
      );
      return result.changes > 0;
    } catch {
      return false;
    }
  }
}
