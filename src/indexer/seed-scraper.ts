/**
 * Seed source scraper for discovering new indie blogs.
 *
 * Scrapes blog URLs from webrings, directories, and blogrolls.
 */

import type { SeedSource } from "./types";

export interface ScrapedBlog {
  url: string;
  name?: string;
  source: string;
}

/**
 * Parse a webring directory page and extract blog URLs.
 */
export function parseWebringDirectory(
  html: string,
  source: SeedSource
): ScrapedBlog[] {
  return extractBlogUrls(html, source);
}

/**
 * Parse a directory page and extract blog URLs.
 */
export function parseDirectoryPage(
  html: string,
  source: SeedSource
): ScrapedBlog[] {
  return extractBlogUrls(html, source);
}

/**
 * Extract blog URLs from HTML content.
 */
function extractBlogUrls(html: string, source: SeedSource): ScrapedBlog[] {
  const blogs: ScrapedBlog[] = [];
  const seenUrls = new Set<string>();

  // Match all anchor tags with href
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const url = match[1];
    const name = match[2]?.trim();

    if (!url) continue;

    // Validate and normalize URL
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) continue;

    // Skip if already seen
    if (seenUrls.has(normalizedUrl)) continue;

    // Filter invalid URLs
    if (!isValidBlogUrl(normalizedUrl)) continue;

    seenUrls.add(normalizedUrl);
    blogs.push({
      url: normalizedUrl,
      name: name || undefined,
      source: source.name,
    });
  }

  return blogs;
}

/**
 * Normalize a URL (remove trailing slash, lowercase hostname).
 */
function normalizeUrl(url: string): string | null {
  try {
    // Skip non-http(s) URLs
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return null;
    }

    const parsed = new URL(url);

    // Remove trailing slash from pathname
    if (parsed.pathname.endsWith("/") && parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    // Remove trailing slash for root paths too
    if (parsed.pathname === "/") {
      return `${parsed.protocol}//${parsed.hostname}`;
    }

    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is a valid blog URL (not social media, email, etc.).
 */
function isValidBlogUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Blocked domains (social media, code hosting, etc.)
    const blockedDomains = [
      "twitter.com",
      "x.com",
      "facebook.com",
      "instagram.com",
      "linkedin.com",
      "github.com",
      "gitlab.com",
      "bitbucket.org",
      "youtube.com",
      "tiktok.com",
      "reddit.com",
      "discord.com",
      "discord.gg",
      "twitch.tv",
      "pinterest.com",
      "tumblr.com", // Tumblr is borderline, but let's skip main domain
      "medium.com", // Medium is a platform, not indie
      "substack.com", // Substack is a platform
      "dev.to", // Platform
      "hashnode.dev", // Platform
      "blogger.com", // Platform
      "wordpress.com", // Platform (not self-hosted)
    ];

    for (const blocked of blockedDomains) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        return false;
      }
    }

    // Block mailto, javascript, etc.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch HTML from a URL with timeout.
 */
export async function fetchHtml(
  url: string,
  timeoutMs: number = 10000
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IndieBlogReader/2.0; +https://indieblogreader.com)",
        Accept: "text/html,application/xhtml+xml",
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

/**
 * Scrape blog URLs from a seed source.
 */
export async function scrapeSeedSource(
  source: SeedSource,
  timeoutMs: number = 10000
): Promise<ScrapedBlog[]> {
  const html = await fetchHtml(source.url, timeoutMs);
  if (!html) return [];

  switch (source.type) {
    case "webring":
      return parseWebringDirectory(html, source);
    case "directory":
      return parseDirectoryPage(html, source);
    case "blogroll":
      return parseDirectoryPage(html, source);
    case "circle":
      return parseWebringDirectory(html, source);
    default:
      return [];
  }
}
