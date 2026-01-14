/**
 * RSS feed discovery and parsing - TypeScript port of Python scraper/rss.py
 */

import type { Article } from "./types";

// RSS paths by SSG - matches Python RSS_PATHS exactly
export const RSS_PATHS: Record<string, string[]> = {
  hexo: ["/atom.xml", "/rss.xml", "/rss2.xml", "/feed.xml"],
  hugo: ["/index.xml", "/feed.xml", "/rss.xml"],
  wordpress: ["/feed/", "/rss/", "/feed/rss2/", "/feed/atom/"],
  typecho: ["/feed/", "/feed/atom/"],
  jekyll: ["/feed.xml", "/atom.xml", "/rss.xml"],
  ghost: ["/rss/", "/feed/"],
  astro: ["/rss.xml", "/feed.xml", "/atom.xml"],
  nextjs: ["/feed.xml", "/rss.xml", "/api/rss"],
  "11ty": ["/feed.xml", "/feed/feed.xml", "/rss.xml"],
  vitepress: ["/feed.xml", "/rss.xml"],
  gatsby: ["/rss.xml", "/feed.xml"],
};

// Default paths for unknown SSGs - matches Python DEFAULT_RSS_PATHS
export const DEFAULT_RSS_PATHS = [
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feed/",
  "/rss/",
];

/**
 * Get RSS feed paths to try for a given SSG.
 */
export function getRssPathsForSsg(ssg: string): string[] {
  const paths = RSS_PATHS[ssg];
  if (paths) {
    return paths;
  }
  return DEFAULT_RSS_PATHS;
}

/**
 * Parse RSS/Atom feed content and extract articles.
 * This is a lightweight parser that handles common RSS/Atom formats.
 */
export function parseRssContent(content: string): Article[] {
  const articles: Article[] = [];

  // Determine feed type and extract items
  const isAtom = content.includes("<feed") && content.includes("xmlns");
  const items = isAtom ? extractAtomEntries(content) : extractRssItems(content);

  for (const item of items) {
    const article: Article = {
      title: extractTagContent(item, isAtom ? "title" : "title") || "",
      url: isAtom ? extractAtomLink(item) : extractTagContent(item, "link") || "",
      description: "",
      cover_image: null,
      language: null,
      published_at: null,
    };

    // Extract description (summary for Atom, description for RSS)
    if (isAtom) {
      article.description = extractTagContent(item, "summary") || extractTagContent(item, "content") || "";
    } else {
      article.description = extractTagContent(item, "description") || extractTagContent(item, "summary") || "";
    }

    // Extract published date
    const pubDate = isAtom
      ? extractTagContent(item, "published") || extractTagContent(item, "updated")
      : extractTagContent(item, "pubDate") || extractTagContent(item, "dc:date");

    if (pubDate) {
      article.published_at = formatDate(pubDate);
    }

    // Extract cover image from media:thumbnail
    const mediaThumbnail = extractMediaThumbnail(item);
    if (mediaThumbnail) {
      article.cover_image = mediaThumbnail;
    }

    // Extract cover image from enclosure (if image type)
    if (!article.cover_image) {
      const enclosureImage = extractEnclosureImage(item);
      if (enclosureImage) {
        article.cover_image = enclosureImage;
      }
    }

    // Extract cover image from content (first image)
    if (!article.cover_image) {
      const contentImage = extractContentImage(item);
      if (contentImage) {
        article.cover_image = contentImage;
      }
    }

    articles.push(article);
  }

  return articles;
}

/**
 * Extract RSS <item> elements from RSS feed.
 */
function extractRssItems(content: string): string[] {
  const items: string[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(content)) !== null) {
    if (match[1]) items.push(match[1]);
  }
  return items;
}

/**
 * Extract Atom <entry> elements from Atom feed.
 */
function extractAtomEntries(content: string): string[] {
  const entries: string[] = [];
  const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = entryRegex.exec(content)) !== null) {
    if (match[1]) entries.push(match[1]);
  }
  return entries;
}

/**
 * Extract content from an XML tag.
 */
function extractTagContent(xml: string, tagName: string): string | null {
  // Handle both regular tags and CDATA
  const patterns = [
    new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, "i"),
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match && match[1] !== undefined) {
      return decodeXmlEntities(match[1].trim());
    }
  }
  return null;
}

/**
 * Extract link from Atom entry (uses href attribute).
 */
function extractAtomLink(entry: string): string {
  // Prefer alternate link, fall back to any link
  const alternateMatch = entry.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i);
  if (alternateMatch && alternateMatch[1]) {
    return alternateMatch[1];
  }

  const linkMatch = entry.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (linkMatch && linkMatch[1]) {
    return linkMatch[1];
  }

  return "";
}

/**
 * Extract media:thumbnail URL.
 */
function extractMediaThumbnail(item: string): string | null {
  const match = item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

/**
 * Extract image URL from enclosure element.
 */
function extractEnclosureImage(item: string): string | null {
  const match = item.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i);
  if (match?.[1]) return match[1];

  // Try with type before url
  const match2 = item.match(/<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["']/i);
  return match2?.[1] ?? null;
}

/**
 * Extract first image from content.
 */
function extractContentImage(item: string): string | null {
  // Look for img tag in content
  const imgMatch = item.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imgMatch?.[1] ?? null;
}

/**
 * Format date string to YYYY-MM-DD.
 */
function formatDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Decode common XML entities.
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Fetch and parse RSS feed from a blog.
 */
export async function fetchRss(
  blogUrl: string,
  ssg: string = "unknown",
  timeout: number = 10000
): Promise<Article[]> {
  const paths = getRssPathsForSsg(ssg);
  const baseUrl = blogUrl.replace(/\/$/, "");

  for (const path of paths) {
    const url = baseUrl + path;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; IndieBlogReader/2.0)",
          Accept: "application/rss+xml, application/atom+xml, text/xml, text/html",
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const content = await response.text();
        // Quick check if it looks like RSS/XML
        if (content.includes("<?xml") || content.includes("<rss") || content.includes("<feed")) {
          return parseRssContent(content);
        }
      }
    } catch {
      // Continue to next path on error
      continue;
    }
  }

  return [];
}

/**
 * Discover RSS feed URL from HTML link tags.
 */
export function discoverRssFromHtml(blogUrl: string, html: string): string | null {
  // Look for <link rel="alternate" type="application/rss+xml" href="...">
  const pattern = /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i;
  const match = html.match(pattern);

  // Also try with href before type
  const pattern2 = /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(rss|atom)\+xml["']/i;
  const match2 = html.match(pattern2);

  const href = match?.[2] || match2?.[1];

  if (href) {
    // Handle relative URLs
    if (href.startsWith("/")) {
      const url = new URL(blogUrl);
      return `${url.protocol}//${url.host}${href}`;
    } else if (href.startsWith("http")) {
      return href;
    }
  }

  return null;
}
