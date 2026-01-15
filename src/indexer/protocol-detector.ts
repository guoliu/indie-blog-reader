/**
 * Protocol detection for indie web standards
 *
 * Detects support for:
 * - OPML blogrolls
 * - WebMention endpoints
 * - Microformats (h-card, h-feed, rel="me", rel="following")
 * - XFN rel attributes (rel="friend", rel="acquaintance", etc.)
 */

// ============================================================================
// Types
// ============================================================================

export interface OPMLResult {
  supported: boolean;
  url?: string;
}

export interface WebMentionResult {
  supported: boolean;
  endpoint?: string;
}

export interface MicroformatsResult {
  hCard: boolean;
  hFeed: boolean;
  relMe: string[];
  relFollowing: string[];
}

export interface XFNLink {
  url: string;
  rel: string[];
}

export interface XFNResult {
  links: XFNLink[];
}

export interface RSSResult {
  supported: boolean;
  url?: string;
}

export interface AllProtocolsResult {
  opml: OPMLResult;
  webmention: WebMentionResult;
  microformats: MicroformatsResult;
  xfn: XFNResult;
  rss: RSSResult;
}

// ============================================================================
// XFN Relations
// ============================================================================

/** Valid XFN relationship values */
const XFN_RELATIONS = new Set([
  "friend",
  "acquaintance",
  "contact",
  "met",
  "co-worker",
  "colleague",
  "co-resident",
  "neighbor",
  "child",
  "parent",
  "sibling",
  "spouse",
  "kin",
  "muse",
  "crush",
  "date",
  "sweetheart",
]);

// ============================================================================
// OPML Detection
// ============================================================================

/**
 * Detect OPML blogroll link in HTML
 */
export function detectOPML(html: string, baseUrl: string): OPMLResult {
  // Look for <link> tags with OPML type
  // Patterns: rel="blogroll", rel="alternate", type="text/x-opml"
  const linkPattern =
    /<link[^>]+(?:rel=["'](?:blogroll|alternate)["'][^>]*type=["']text\/x-opml["']|type=["']text\/x-opml["'][^>]*rel=["'](?:blogroll|alternate)["'])[^>]*href=["']([^"']+)["']/i;

  // Also try just type="text/x-opml" for link tags
  const typeOnlyPattern =
    /<link[^>]+type=["']text\/x-opml["'][^>]*href=["']([^"']+)["']/i;

  // Also check anchor tags with type="text/x-opml"
  const anchorPattern =
    /<a[^>]+href=["']([^"']+\.opml)["'][^>]*type=["']text\/x-opml["'][^>]*>/i;
  const anchorPattern2 =
    /<a[^>]+type=["']text\/x-opml["'][^>]*href=["']([^"']+)["'][^>]*>/i;
  const anchorPattern3 =
    /<a[^>]+href=["']([^"']+\.opml)["'][^>]*>/i; // Any link to .opml file

  let match = html.match(linkPattern);
  if (!match) {
    match = html.match(typeOnlyPattern);
  }
  if (!match) {
    match = html.match(anchorPattern);
  }
  if (!match) {
    match = html.match(anchorPattern2);
  }
  if (!match) {
    match = html.match(anchorPattern3);
  }

  if (match && match[1]) {
    return {
      supported: true,
      url: resolveUrl(match[1], baseUrl),
    };
  }

  return { supported: false };
}

// ============================================================================
// WebMention Detection
// ============================================================================

/**
 * Detect WebMention endpoint in HTML
 * Per spec: link tag takes precedence over anchor tag
 */
export function detectWebMention(
  html: string,
  baseUrl: string
): WebMentionResult {
  // First try link tag (higher priority per spec)
  const linkPattern = /<link[^>]+rel=["']webmention["'][^>]*href=["']([^"']+)["']/i;
  const linkMatch = html.match(linkPattern);

  if (linkMatch && linkMatch[1]) {
    return {
      supported: true,
      endpoint: resolveUrl(linkMatch[1], baseUrl),
    };
  }

  // Fall back to anchor tag
  const anchorPattern = /<a[^>]+rel=["']webmention["'][^>]*href=["']([^"']+)["']/i;
  const anchorMatch = html.match(anchorPattern);

  if (anchorMatch && anchorMatch[1]) {
    return {
      supported: true,
      endpoint: resolveUrl(anchorMatch[1], baseUrl),
    };
  }

  return { supported: false };
}

// ============================================================================
// Microformats Detection
// ============================================================================

/**
 * Detect microformats2 markers in HTML
 */
export function detectMicroformats(html: string): MicroformatsResult {
  const result: MicroformatsResult = {
    hCard: false,
    hFeed: false,
    relMe: [],
    relFollowing: [],
  };

  // Detect h-card (class contains "h-card")
  result.hCard = /class=["'][^"']*\bh-card\b[^"']*["']/i.test(html);

  // Detect h-feed
  result.hFeed = /class=["'][^"']*\bh-feed\b[^"']*["']/i.test(html);

  // Extract rel="me" links
  const relMePattern = /<a[^>]+rel=["'][^"']*\bme\b[^"']*["'][^>]*href=["']([^"']+)["']/gi;
  let match;
  while ((match = relMePattern.exec(html)) !== null) {
    if (match[1]) {
      result.relMe.push(match[1]);
    }
  }

  // Also check href before rel
  const relMePattern2 = /<a[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*\bme\b[^"']*["']/gi;
  while ((match = relMePattern2.exec(html)) !== null) {
    if (match[1] && !result.relMe.includes(match[1])) {
      result.relMe.push(match[1]);
    }
  }

  // Extract rel="following" links
  const relFollowingPattern =
    /<a[^>]+rel=["'][^"']*\bfollowing\b[^"']*["'][^>]*href=["']([^"']+)["']/gi;
  while ((match = relFollowingPattern.exec(html)) !== null) {
    if (match[1]) {
      result.relFollowing.push(match[1]);
    }
  }

  // Also check href before rel for following
  const relFollowingPattern2 =
    /<a[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*\bfollowing\b[^"']*["']/gi;
  while ((match = relFollowingPattern2.exec(html)) !== null) {
    if (match[1] && !result.relFollowing.includes(match[1])) {
      result.relFollowing.push(match[1]);
    }
  }

  return result;
}

// ============================================================================
// XFN Detection
// ============================================================================

/**
 * Detect XFN relationship attributes on links
 */
export function detectXFN(html: string): XFNResult {
  const links: XFNLink[] = [];

  // Match all anchor tags with rel attribute
  const anchorPattern = /<a[^>]+href=["']([^"']+)["'][^>]*rel=["']([^"']+)["'][^>]*>/gi;
  const anchorPattern2 = /<a[^>]+rel=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;

  const processMatch = (url: string, relValue: string) => {
    // Parse space-separated rel values
    const relValues = relValue.toLowerCase().split(/\s+/);

    // Filter to only XFN relations
    const xfnRels = relValues.filter((r) => XFN_RELATIONS.has(r));

    if (xfnRels.length > 0) {
      links.push({
        url,
        rel: xfnRels,
      });
    }
  };

  let match;
  while ((match = anchorPattern.exec(html)) !== null) {
    processMatch(match[1], match[2]);
  }

  while ((match = anchorPattern2.exec(html)) !== null) {
    // For this pattern, rel is first, href is second
    const existingUrls = links.map((l) => l.url);
    if (!existingUrls.includes(match[2])) {
      processMatch(match[2], match[1]);
    }
  }

  return { links };
}

// ============================================================================
// RSS Detection
// ============================================================================

/**
 * Detect RSS/Atom feed links in HTML
 */
export function detectRSS(html: string, baseUrl: string): RSSResult {
  // Look for RSS/Atom link elements
  // <link rel="alternate" type="application/rss+xml" href="...">
  // <link rel="alternate" type="application/atom+xml" href="...">
  const rssPattern =
    /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(rss|atom)\+xml["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const rssPattern2 =
    /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const rssPattern3 =
    /<link[^>]+href=["']([^"']+)["'][^>]*type=["']application\/(rss|atom)\+xml["'][^>]*>/gi;

  let match;

  // Try all patterns
  if ((match = rssPattern.exec(html)) !== null) {
    return { supported: true, url: resolveUrl(match[2], baseUrl) };
  }

  if ((match = rssPattern2.exec(html)) !== null) {
    return { supported: true, url: resolveUrl(match[2], baseUrl) };
  }

  if ((match = rssPattern3.exec(html)) !== null) {
    return { supported: true, url: resolveUrl(match[1], baseUrl) };
  }

  return { supported: false };
}

// ============================================================================
// Combined Detection
// ============================================================================

/**
 * Detect all protocols in one pass
 */
export function detectAllProtocols(
  html: string,
  baseUrl: string
): AllProtocolsResult {
  return {
    opml: detectOPML(html, baseUrl),
    webmention: detectWebMention(html, baseUrl),
    microformats: detectMicroformats(html),
    xfn: detectXFN(html),
    rss: detectRSS(html, baseUrl),
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve a potentially relative URL against a base URL
 */
function resolveUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}
