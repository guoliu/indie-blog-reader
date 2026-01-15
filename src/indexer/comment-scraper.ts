/**
 * Comment scraper - extracts comment counts from article pages.
 *
 * Supports multiple comment systems:
 * - Giscus (GitHub Discussions)
 * - Disqus
 * - Utterances (GitHub Issues)
 * - Cusdis
 * - Native comment counts (WordPress, etc.)
 */

export interface CommentResult {
  count: number;
  system: string;
}

/**
 * Detect comment system from HTML content.
 */
export function detectCommentSystem(html: string): string | null {
  // Giscus (GitHub Discussions based)
  if (html.includes("giscus") || html.includes("data-giscus")) {
    return "giscus";
  }

  // Disqus
  if (html.includes("disqus") || html.includes("disqus_thread")) {
    return "disqus";
  }

  // Utterances (GitHub Issues based)
  if (html.includes("utterances") || html.includes("utteranc.es")) {
    return "utterances";
  }

  // Cusdis
  if (html.includes("cusdis")) {
    return "cusdis";
  }

  // WordPress native comments
  if (html.includes("wp-comments") || html.includes("comment-respond")) {
    return "wordpress";
  }

  return null;
}

/**
 * Parse Giscus comment count.
 * Giscus shows comment count in a data attribute or in the iframe content.
 */
export function parseGiscusComments(html: string): number | null {
  // Look for data-discussion-count attribute
  const discussionMatch = html.match(
    /data-discussion-count=["']?(\d+)["']?/i
  );
  if (discussionMatch?.[1]) {
    return parseInt(discussionMatch[1], 10);
  }

  // Look for reactions count in Giscus widget
  const reactionsMatch = html.match(
    /giscus.*?(\d+)\s*(?:comment|reaction)/i
  );
  if (reactionsMatch?.[1]) {
    return parseInt(reactionsMatch[1], 10);
  }

  // Giscus loads comments dynamically, so initial page load may have 0
  // We can still detect if Giscus is present
  if (
    html.includes("data-giscus") ||
    html.includes("giscus.app") ||
    html.includes('class="giscus"') ||
    html.includes("class='giscus'")
  ) {
    return 0; // Giscus present but count unknown from static HTML
  }

  return null;
}

/**
 * Parse Disqus comment count.
 * Disqus typically shows count in a link or span with specific class.
 */
export function parseDisqusComments(html: string): number | null {
  // Look for disqus-comment-count elements with count text
  const countMatch = html.match(
    /disqus-comment-count[^>]*>.*?(\d+)\s*(?:comment|Comment)/i
  );
  if (countMatch?.[1]) {
    return parseInt(countMatch[1], 10);
  }

  // Look for data-disqus-identifier with comment count
  const identifierMatch = html.match(
    /#disqus_thread[^>]*>.*?(\d+)/i
  );
  if (identifierMatch?.[1]) {
    return parseInt(identifierMatch[1], 10);
  }

  // Disqus loads dynamically
  if (html.includes("disqus_thread") || html.includes("disqus.com")) {
    return 0;
  }

  return null;
}

/**
 * Parse Utterances comment count.
 * Utterances shows count as GitHub issue comments.
 */
export function parseUtterancesComments(html: string): number | null {
  // Utterances loads dynamically via iframe
  if (html.includes("utterances") || html.includes("utteranc.es")) {
    return 0; // Present but count unknown from static HTML
  }

  return null;
}

/**
 * Parse WordPress native comment count.
 */
export function parseWordPressComments(html: string): number | null {
  // Look for comments-link with count
  const commentsLinkMatch = html.match(
    /comments-link[^>]*>.*?(\d+)\s*(?:comment|Comment)/i
  );
  if (commentsLinkMatch?.[1]) {
    return parseInt(commentsLinkMatch[1], 10);
  }

  // Look for comment count in title or header
  const commentsHeaderMatch = html.match(
    /(\d+)\s*(?:thought|comment|response)s?\s*(?:on|to)/i
  );
  if (commentsHeaderMatch?.[1]) {
    return parseInt(commentsHeaderMatch[1], 10);
  }

  // Look for comment list items
  const commentListMatch = html.match(
    /<li[^>]*class=["'][^"']*comment[^"']*["'][^>]*>/gi
  );
  if (commentListMatch) {
    return commentListMatch.length;
  }

  return null;
}

/**
 * Parse Cusdis comment count.
 */
export function parseCusdisComments(html: string): number | null {
  // Cusdis loads dynamically
  if (html.includes("cusdis")) {
    return 0;
  }

  return null;
}

// Comment parser registry
const COMMENT_PARSERS: Record<string, (html: string) => number | null> = {
  giscus: parseGiscusComments,
  disqus: parseDisqusComments,
  utterances: parseUtterancesComments,
  wordpress: parseWordPressComments,
  cusdis: parseCusdisComments,
};

/**
 * Scrape comment count from article HTML.
 *
 * @param html - The article page HTML
 * @param knownSystem - Optional known comment system for the blog
 * @returns Comment count and detected system, or null if not found
 */
export function scrapeCommentsFromHtml(
  html: string,
  knownSystem?: string | null
): CommentResult | null {
  // If we know the system, use its parser directly
  if (knownSystem && COMMENT_PARSERS[knownSystem]) {
    const count = COMMENT_PARSERS[knownSystem](html);
    if (count !== null) {
      return { count, system: knownSystem };
    }
  }

  // Try to detect the system
  const detectedSystem = detectCommentSystem(html);
  if (detectedSystem && COMMENT_PARSERS[detectedSystem]) {
    const count = COMMENT_PARSERS[detectedSystem](html);
    if (count !== null) {
      return { count, system: detectedSystem };
    }
  }

  // Try all parsers as fallback
  for (const [system, parser] of Object.entries(COMMENT_PARSERS)) {
    const count = parser(html);
    if (count !== null && count > 0) {
      return { count, system };
    }
  }

  return null;
}

/**
 * Fetch article page and scrape comment count.
 *
 * @param articleUrl - The article URL to fetch
 * @param knownSystem - Optional known comment system for the blog
 * @param timeout - Request timeout in milliseconds
 * @returns Comment result or null if scraping failed
 */
export async function scrapeCommentCount(
  articleUrl: string,
  knownSystem?: string | null,
  timeout: number = 10000
): Promise<CommentResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(articleUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IndieBlogReader/2.0)",
        Accept: "text/html",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return scrapeCommentsFromHtml(html, knownSystem);
  } catch {
    return null;
  }
}
