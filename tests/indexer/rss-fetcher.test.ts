/**
 * Tests for RSS feed parsing - validates parity with Python scraper/rss.py
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  getRssPathsForSsg,
  parseRssContent,
  discoverRssFromHtml,
  RSS_PATHS,
  DEFAULT_RSS_PATHS,
} from "../../src/indexer/rss-fetcher";

const FIXTURES_DIR = join(__dirname, "../fixtures/rss");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

describe("RSS Path Discovery", () => {
  test("Hexo blogs should try /atom.xml first", () => {
    const paths = getRssPathsForSsg("hexo");
    expect(paths).toContain("/atom.xml");
    expect(paths).toContain("/rss.xml");
    expect(paths[0]).toBe("/atom.xml"); // First priority
  });

  test("Hugo blogs should try /index.xml first", () => {
    const paths = getRssPathsForSsg("hugo");
    expect(paths).toContain("/index.xml");
    expect(paths).toContain("/feed.xml");
    expect(paths[0]).toBe("/index.xml"); // First priority
  });

  test("WordPress blogs should try /feed/ first", () => {
    const paths = getRssPathsForSsg("wordpress");
    expect(paths).toContain("/feed/");
    expect(paths[0]).toBe("/feed/"); // First priority
  });

  test("Jekyll blogs have correct paths", () => {
    const paths = getRssPathsForSsg("jekyll");
    expect(paths).toContain("/feed.xml");
    expect(paths).toContain("/atom.xml");
  });

  test("Ghost blogs have correct paths", () => {
    const paths = getRssPathsForSsg("ghost");
    expect(paths).toContain("/rss/");
    expect(paths).toContain("/feed/");
  });

  test("Unknown SSG returns common RSS paths", () => {
    const paths = getRssPathsForSsg("unknown");
    expect(paths.length).toBeGreaterThan(0);
    expect(paths).toEqual(DEFAULT_RSS_PATHS);
    // Should include common paths
    expect(paths.some((p) => p.includes("/feed") || p.includes("/rss") || p.includes("/atom"))).toBe(true);
  });

  test("All SSG types have at least one path", () => {
    for (const ssg of Object.keys(RSS_PATHS)) {
      const paths = getRssPathsForSsg(ssg);
      expect(paths.length).toBeGreaterThan(0);
    }
  });
});

describe("RSS Content Parsing", () => {
  test("parses basic RSS feed", () => {
    const content = loadFixture("rss-basic.xml");
    const articles = parseRssContent(content);

    expect(articles.length).toBe(1);
    expect(articles[0].title).toBe("Test Article");
    expect(articles[0].url).toBe("https://example.com/post1");
    expect(articles[0].description.toLowerCase()).toContain("test article description");
    expect(articles[0].published_at).toBe("2025-01-13");
  });

  test("parses basic Atom feed", () => {
    const content = loadFixture("atom-basic.xml");
    const articles = parseRssContent(content);

    expect(articles.length).toBe(1);
    expect(articles[0].title).toBe("Atom Article");
    expect(articles[0].url).toBe("https://example.com/atom-post");
    expect(articles[0].description).toContain("Atom article summary");
    expect(articles[0].published_at).toBe("2025-01-13");
  });

  test("extracts cover image from media:thumbnail", () => {
    const content = loadFixture("rss-media-thumbnail.xml");
    const articles = parseRssContent(content);

    expect(articles.length).toBe(1);
    expect(articles[0].cover_image).toBe("https://example.com/cover.jpg");
  });

  test("extracts cover image from enclosure", () => {
    const content = loadFixture("rss-enclosure.xml");
    const articles = parseRssContent(content);

    expect(articles.length).toBe(1);
    expect(articles[0].cover_image).toBe("https://example.com/image.png");
  });

  test("extracts cover image from content", () => {
    const content = loadFixture("rss-content-image.xml");
    const articles = parseRssContent(content);

    expect(articles.length).toBe(1);
    expect(articles[0].cover_image).toBe("https://example.com/inline-image.jpg");
  });

  test("handles CDATA content", () => {
    const content = loadFixture("rss-cdata.xml");
    const articles = parseRssContent(content);

    expect(articles.length).toBe(1);
    expect(articles[0].title).toContain("CDATA");
    expect(articles[0].description).toContain("HTML");
  });

  test("handles missing fields gracefully", () => {
    const content = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Only Title</title>
          </item>
        </channel>
      </rss>`;
    const articles = parseRssContent(content);

    expect(articles.length).toBe(1);
    expect(articles[0].title).toBe("Only Title");
    expect(articles[0].url).toBe("");
    expect(articles[0].description).toBe("");
    expect(articles[0].cover_image).toBeNull();
    expect(articles[0].published_at).toBeNull();
  });

  test("handles multiple items", () => {
    const content = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item><title>Post 1</title><link>https://example.com/1</link></item>
          <item><title>Post 2</title><link>https://example.com/2</link></item>
          <item><title>Post 3</title><link>https://example.com/3</link></item>
        </channel>
      </rss>`;
    const articles = parseRssContent(content);

    expect(articles.length).toBe(3);
    expect(articles[0].title).toBe("Post 1");
    expect(articles[1].title).toBe("Post 2");
    expect(articles[2].title).toBe("Post 3");
  });

  test("handles XML entities in content", () => {
    const content = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Post &amp; Title &lt;with&gt; entities</title>
            <link>https://example.com/post</link>
          </item>
        </channel>
      </rss>`;
    const articles = parseRssContent(content);

    expect(articles.length).toBe(1);
    expect(articles[0].title).toBe("Post & Title <with> entities");
  });

  test("handles various date formats", () => {
    // RFC 822 (RSS)
    const rss = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Post</title>
            <pubDate>Wed, 15 Jan 2025 12:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`;
    const rssArticles = parseRssContent(rss);
    expect(rssArticles[0].published_at).toBe("2025-01-15");

    // ISO 8601 (Atom)
    const atom = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Post</title>
          <link href="https://example.com"/>
          <published>2025-01-15T12:00:00+08:00</published>
        </entry>
      </feed>`;
    const atomArticles = parseRssContent(atom);
    expect(atomArticles[0].published_at).toBe("2025-01-15");
  });
});

describe("RSS Discovery from HTML", () => {
  test("finds RSS URL from link rel=alternate tag", () => {
    const html = `
      <html>
      <head>
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="RSS">
      </head>
      </html>
    `;
    const rssUrl = discoverRssFromHtml("https://example.com", html);
    expect(rssUrl).toBe("https://example.com/feed.xml");
  });

  test("finds Atom feed URL from link tag", () => {
    const html = `
      <html>
      <head>
        <link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml">
      </head>
      </html>
    `;
    const rssUrl = discoverRssFromHtml("https://example.com", html);
    expect(rssUrl).toBe("https://example.com/atom.xml");
  });

  test("returns null when no RSS link found", () => {
    const html = `
      <html>
      <head>
        <title>No RSS here</title>
      </head>
      </html>
    `;
    const rssUrl = discoverRssFromHtml("https://example.com", html);
    expect(rssUrl).toBeNull();
  });

  test("handles relative URLs", () => {
    const html = `<link type="application/rss+xml" href="/blog/feed.xml">`;
    const rssUrl = discoverRssFromHtml("https://example.com/page", html);
    expect(rssUrl).toBe("https://example.com/blog/feed.xml");
  });

  test("handles absolute URLs", () => {
    const html = `<link type="application/rss+xml" href="https://cdn.example.com/feed.xml">`;
    const rssUrl = discoverRssFromHtml("https://example.com", html);
    expect(rssUrl).toBe("https://cdn.example.com/feed.xml");
  });

  test("handles href before type attribute", () => {
    const html = `<link href="/feed.xml" type="application/rss+xml">`;
    const rssUrl = discoverRssFromHtml("https://example.com", html);
    expect(rssUrl).toBe("https://example.com/feed.xml");
  });
});

describe("Edge Cases", () => {
  test("handles empty feed", () => {
    const content = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Empty Blog</title>
        </channel>
      </rss>`;
    const articles = parseRssContent(content);
    expect(articles.length).toBe(0);
  });

  test("handles malformed date", () => {
    const content = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Post</title>
            <pubDate>not a real date</pubDate>
          </item>
        </channel>
      </rss>`;
    const articles = parseRssContent(content);
    expect(articles.length).toBe(1);
    expect(articles[0].published_at).toBeNull();
  });

  test("prefers media:thumbnail over enclosure", () => {
    const content = `<?xml version="1.0"?>
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <item>
            <title>Post</title>
            <media:thumbnail url="https://example.com/thumbnail.jpg"/>
            <enclosure url="https://example.com/enclosure.png" type="image/png"/>
          </item>
        </channel>
      </rss>`;
    const articles = parseRssContent(content);
    expect(articles[0].cover_image).toBe("https://example.com/thumbnail.jpg");
  });

  test("ignores non-image enclosures", () => {
    const content = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Podcast Episode</title>
            <enclosure url="https://example.com/audio.mp3" type="audio/mpeg"/>
          </item>
        </channel>
      </rss>`;
    const articles = parseRssContent(content);
    expect(articles[0].cover_image).toBeNull();
  });

  test("handles Atom with alternate link", () => {
    const content = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Post</title>
          <link rel="alternate" type="text/html" href="https://example.com/post"/>
          <link rel="edit" href="https://example.com/api/post"/>
        </entry>
      </feed>`;
    const articles = parseRssContent(content);
    expect(articles[0].url).toBe("https://example.com/post");
  });
});
