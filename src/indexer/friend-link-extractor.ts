/**
 * Friend link extraction - protocol-first, heuristic-fallback
 *
 * Extraction priority:
 * 1. XFN rel attributes (rel="friend", rel="acquaintance")
 * 2. Microformats (rel="following")
 * 3. Heuristic detection (container classes, headings)
 */

// ============================================================================
// Types
// ============================================================================

export interface FriendLink {
  url: string;
  name?: string;
  description?: string;
  discoveryMethod: "opml" | "xfn" | "microformat" | "heuristic";
  confidence: number;
}

export interface ExtractOptions {
  html: string;
  url: string;
}

// ============================================================================
// Constants
// ============================================================================

/** URLs that match these patterns are friend link pages */
const FRIEND_LINK_PAGE_PATTERNS = [
  // Chinese
  /^\/friends\/?$/i,
  /^\/links\/?$/i,
  /^\/友链\/?$/,
  /^\/link\/?$/i,
  /^\/blogroll\/?$/i,
  // English
  /^\/reads\/?$/i,
  /^\/roll\/?$/i,
  /^\/following\/?$/i,
];

/** CSS selectors for friend link containers */
const FRIEND_LINK_CONTAINER_PATTERNS = [
  /class=["'][^"']*friend-links?[^"']*["']/i,
  /class=["'][^"']*blogroll[^"']*["']/i,
  /class=["'][^"']*links-list[^"']*["']/i,
  /class=["'][^"']*link-card[^"']*["']/i,
  /class=["'][^"']*friend-card[^"']*["']/i,
];

/** Heading patterns that indicate friend links section */
const FRIEND_LINK_HEADINGS = {
  zh: [/友[情]?链/, /朋友.*博客/, /推荐博客/, /友情链接/, /博客朋友/],
  en: [/blogroll/i, /friends/i, /reads/i, /cool\s*(people|blogs)/i, /following/i],
};

/** Social media and other domains to exclude */
const EXCLUDED_DOMAINS = new Set([
  "twitter.com",
  "x.com",
  "github.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "linkedin.com",
  "weibo.com",
  "zhihu.com",
  "douban.com",
  "bilibili.com",
  "t.me",
  "telegram.org",
  "discord.com",
  "discord.gg",
  "reddit.com",
  "medium.com",
  "dev.to",
]);

/** XFN relations and their confidence scores */
const XFN_CONFIDENCE: Record<string, number> = {
  friend: 0.9,
  acquaintance: 0.7,
  contact: 0.6,
  met: 0.8,
  colleague: 0.7,
  "co-worker": 0.7,
};

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Check if a URL is a valid blog URL
 */
export function isValidBlogUrl(url: string): boolean {
  // Reject internal and special URLs
  if (
    !url ||
    url.startsWith("#") ||
    url.startsWith("javascript:") ||
    url.startsWith("mailto:") ||
    url.startsWith("/")
  ) {
    return false;
  }

  // Must be http/https
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return false;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Check against excluded domains
    for (const domain of EXCLUDED_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Page Detection
// ============================================================================

/**
 * Detect if a URL path indicates a friend link page
 */
export function detectFriendLinkPage(path: string): boolean {
  const normalizedPath = path.toLowerCase();

  for (const pattern of FRIEND_LINK_PAGE_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// XFN Extraction
// ============================================================================

/**
 * Extract friend links from XFN rel attributes
 */
export function extractFromXFN(html: string): FriendLink[] {
  const links: FriendLink[] = [];

  // Match anchor tags with rel attributes containing XFN values
  const anchorPattern =
    /<a[^>]+href=["']([^"']+)["'][^>]*rel=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  const anchorPattern2 =
    /<a[^>]+rel=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;

  const processMatch = (url: string, relValue: string, name: string) => {
    const relValues = relValue.toLowerCase().split(/\s+/);

    // Check for XFN relations
    for (const rel of relValues) {
      if (rel in XFN_CONFIDENCE) {
        links.push({
          url,
          name: name.trim() || undefined,
          discoveryMethod: "xfn",
          confidence: XFN_CONFIDENCE[rel] ?? 0.5,
        });
        return; // Only add once per URL
      }
    }
  };

  let match;
  const seenUrls = new Set<string>();

  while ((match = anchorPattern.exec(html)) !== null) {
    const url = match[1] ?? "";
    const relValue = match[2] ?? "";
    const name = match[3] ?? "";
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      processMatch(url, relValue, name);
    }
  }

  while ((match = anchorPattern2.exec(html)) !== null) {
    const url = match[2] ?? "";
    const relValue = match[1] ?? "";
    const name = match[3] ?? "";
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      processMatch(url, relValue, name);
    }
  }

  return links;
}

// ============================================================================
// Microformats Extraction
// ============================================================================

/**
 * Extract friend links from microformats (rel="following")
 */
export function extractFromMicroformats(html: string): FriendLink[] {
  const links: FriendLink[] = [];

  // Match rel="following" links
  const followingPattern =
    /<a[^>]+rel=["'][^"']*\bfollowing\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  const followingPattern2 =
    /<a[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*\bfollowing\b[^"']*["'][^>]*>([^<]*)<\/a>/gi;

  const seenUrls = new Set<string>();

  let match;
  while ((match = followingPattern.exec(html)) !== null) {
    const url = match[1] ?? "";
    const name = match[2] ?? "";
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      links.push({
        url,
        name: name.trim() || undefined,
        discoveryMethod: "microformat",
        confidence: 0.85,
      });
    }
  }

  while ((match = followingPattern2.exec(html)) !== null) {
    const url = match[1] ?? "";
    const name = match[2] ?? "";
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url);
      links.push({
        url,
        name: name.trim() || undefined,
        discoveryMethod: "microformat",
        confidence: 0.85,
      });
    }
  }

  return links;
}

// ============================================================================
// Heuristic Extraction
// ============================================================================

/**
 * Extract friend links using heuristics (container classes, headings)
 */
export function extractFromHeuristics(html: string): FriendLink[] {
  const links: FriendLink[] = [];
  const seenUrls = new Set<string>();

  // Check for friend link containers using simple string matching
  const containerKeywords = [
    "friend-links",
    "friend-link",
    "blogroll",
    "links-list",
    "link-card",
    "friend-card",
  ];

  for (const keyword of containerKeywords) {
    // Find the container and extract content between the opening and closing tags
    const containerRegex = new RegExp(
      `<(div|ul|section|nav)[^>]*class=["'][^"']*${keyword}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "gi"
    );

    let match;
    while ((match = containerRegex.exec(html)) !== null) {
      const content = match[2] ?? "";
      if (content) {
        extractLinksFromContent(content, links, seenUrls);
      }
    }
  }

  // Check for headings indicating friend links
  const allHeadingPatterns = [
    ...FRIEND_LINK_HEADINGS.zh,
    ...FRIEND_LINK_HEADINGS.en,
  ];

  for (const headingPattern of allHeadingPatterns) {
    const headingRegex = new RegExp(
      `<h[1-6][^>]*>[^<]*${headingPattern.source}[^<]*<\\/h[1-6]>([\\s\\S]{0,2000}?)(?=<h[1-6]|$)`,
      "i"
    );

    const headingMatch = html.match(headingRegex);
    if (headingMatch) {
      const content = headingMatch[1] ?? "";
      if (content) {
        extractLinksFromContent(content, links, seenUrls);
      }
    }
  }

  return links;
}

/**
 * Extract links from HTML content
 */
function extractLinksFromContent(
  content: string,
  links: FriendLink[],
  seenUrls: Set<string>
): void {
  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;

  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    const url = match[1] ?? "";
    const name = (match[2] ?? "").trim();

    if (url && !seenUrls.has(url) && isValidBlogUrl(url)) {
      seenUrls.add(url);
      links.push({
        url,
        name: name || undefined,
        discoveryMethod: "heuristic",
        confidence: 0.6,
      });
    }
  }
}

// ============================================================================
// Combined Extraction
// ============================================================================

/**
 * Extract friend links using all methods, preferring protocol-based extraction
 */
export async function extractFriendLinks(
  options: ExtractOptions
): Promise<FriendLink[]> {
  const { html } = options;
  const allLinks: FriendLink[] = [];
  const seenUrls = new Map<string, FriendLink>();

  // 1. Try XFN first (highest confidence)
  const xfnLinks = extractFromXFN(html);
  for (const link of xfnLinks) {
    if (isValidBlogUrl(link.url)) {
      seenUrls.set(link.url, link);
    }
  }

  // 2. Try microformats
  const microformatLinks = extractFromMicroformats(html);
  for (const link of microformatLinks) {
    if (isValidBlogUrl(link.url) && !seenUrls.has(link.url)) {
      seenUrls.set(link.url, link);
    }
  }

  // 3. Fall back to heuristics
  const heuristicLinks = extractFromHeuristics(html);
  for (const link of heuristicLinks) {
    if (isValidBlogUrl(link.url) && !seenUrls.has(link.url)) {
      seenUrls.set(link.url, link);
    }
  }

  return Array.from(seenUrls.values());
}
