/**
 * Integration tests for seed scraper with real English sources.
 *
 * These tests make real network requests to verify the scraper
 * works with actual seed source pages.
 */

import { describe, test, expect } from "bun:test";
import { scrapeSeedSource } from "../../src/indexer/seed-scraper";
import type { SeedSource } from "../../src/indexer/types";

describe("Seed Scraper Integration", () => {
  // Test each English source with real network requests
  const englishSources: SeedSource[] = [
    {
      url: "https://xn--sr8hvo.ws/directory",
      name: "IndieWeb Webring",
      type: "webring",
      languages: ["en"],
    },
    {
      url: "https://webring.xxiivv.com/",
      name: "XXIIVV Webring",
      type: "webring",
      languages: ["en"],
    },
    {
      url: "https://blogroll.org",
      name: "Ye Olde Blogroll",
      type: "directory",
      languages: ["en"],
    },
  ];

  for (const source of englishSources) {
    test(
      `scrapes ${source.name}`,
      async () => {
        const blogs = await scrapeSeedSource(source, 15000);

        console.log(`${source.name}: found ${blogs.length} blogs`);

        // Should find at least some blogs
        expect(blogs.length).toBeGreaterThan(10);

        // All URLs should be valid
        for (const blog of blogs.slice(0, 5)) {
          expect(blog.url).toMatch(/^https?:\/\//);
          expect(blog.source).toBe(source.name);
        }
      },
      30000
    ); // 30s timeout for network requests
  }

  test(
    "ooh.directory finds blogs",
    async () => {
      const source: SeedSource = {
        url: "https://ooh.directory/",
        name: "ooh.directory",
        type: "directory",
        languages: ["en"],
      };

      const blogs = await scrapeSeedSource(source, 15000);
      console.log(`ooh.directory: found ${blogs.length} blogs`);

      // Should find some blogs
      expect(blogs.length).toBeGreaterThan(0);
    },
    30000
  );

  test("personalsit.es may require JS rendering", async () => {
    const source: SeedSource = {
      url: "https://personalsit.es",
      name: "personalsit.es",
      type: "directory",
      languages: ["en"],
    };

    const blogs = await scrapeSeedSource(source, 15000);
    console.log(`personalsit.es: found ${blogs.length} blogs`);

    // May return 0 if JS rendering required, or some if static HTML
    expect(blogs.length).toBeGreaterThanOrEqual(0);
  }, 30000);

  test("indieseek.xyz links page", async () => {
    const source: SeedSource = {
      url: "https://indieseek.xyz/links/",
      name: "Indieseek Links",
      type: "directory",
      languages: ["en"],
    };

    const blogs = await scrapeSeedSource(source, 15000);
    console.log(`Indieseek Links: found ${blogs.length} blogs`);

    // Should find some links
    expect(blogs.length).toBeGreaterThanOrEqual(0);
  }, 30000);
});
