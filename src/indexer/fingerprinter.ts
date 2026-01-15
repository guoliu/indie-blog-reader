/**
 * Site fingerprinting - detects SSG, theme, and comment system
 *
 * Detection methods:
 * - Generator meta tags
 * - HTML comments
 * - Specific paths and class names
 * - Script sources
 */

// ============================================================================
// Types
// ============================================================================

export interface SSGResult {
  ssg: string | null;
  confidence: number;
  signals: string[];
}

export interface ThemeResult {
  theme: string | null;
  confidence: number;
}

export interface FingerprintResult {
  ssg: string | null;
  theme: string | null;
  commentSystem: string | null;
  confidence: number;
  signals: string[];
}

/** Alias for backwards compatibility */
export type SiteFingerprint = FingerprintResult;

// ============================================================================
// SSG Detection
// ============================================================================

interface SSGPattern {
  name: string;
  patterns: Array<{
    type: "generator" | "comment" | "path" | "class" | "script";
    pattern: RegExp;
    confidence: number;
  }>;
}

const SSG_PATTERNS: SSGPattern[] = [
  {
    name: "hexo",
    patterns: [
      { type: "generator", pattern: /hexo/i, confidence: 0.95 },
      { type: "comment", pattern: /hexo-inject/i, confidence: 0.9 },
      { type: "path", pattern: /\/hexo\//i, confidence: 0.7 },
    ],
  },
  {
    name: "hugo",
    patterns: [
      { type: "generator", pattern: /hugo/i, confidence: 0.95 },
      { type: "comment", pattern: /generator:\s*hugo/i, confidence: 0.9 },
      { type: "path", pattern: /\/hugo\//i, confidence: 0.6 },
    ],
  },
  {
    name: "wordpress",
    patterns: [
      { type: "generator", pattern: /wordpress/i, confidence: 0.95 },
      { type: "path", pattern: /\/wp-content\//i, confidence: 0.9 },
      { type: "path", pattern: /\/wp-includes\//i, confidence: 0.9 },
    ],
  },
  {
    name: "jekyll",
    patterns: [
      { type: "generator", pattern: /jekyll/i, confidence: 0.95 },
      { type: "comment", pattern: /jekyll/i, confidence: 0.7 },
    ],
  },
  {
    name: "ghost",
    patterns: [
      { type: "generator", pattern: /ghost/i, confidence: 0.95 },
      { type: "class", pattern: /class=["'][^"']*ghost-/i, confidence: 0.8 },
    ],
  },
  {
    name: "typecho",
    patterns: [
      { type: "generator", pattern: /typecho/i, confidence: 0.95 },
      { type: "path", pattern: /\/usr\/themes\//i, confidence: 0.8 },
    ],
  },
  {
    name: "astro",
    patterns: [
      { type: "generator", pattern: /astro/i, confidence: 0.95 },
      { type: "comment", pattern: /astro/i, confidence: 0.7 },
    ],
  },
  {
    name: "nextjs",
    patterns: [
      { type: "script", pattern: /_next\/static/i, confidence: 0.85 },
      { type: "path", pattern: /\/_next\//i, confidence: 0.85 },
    ],
  },
  {
    name: "gatsby",
    patterns: [
      { type: "generator", pattern: /gatsby/i, confidence: 0.95 },
      { type: "path", pattern: /\/gatsby\//i, confidence: 0.7 },
    ],
  },
  {
    name: "vitepress",
    patterns: [
      { type: "generator", pattern: /vitepress/i, confidence: 0.95 },
      { type: "class", pattern: /class=["'][^"']*VPDoc/i, confidence: 0.8 },
    ],
  },
  {
    name: "11ty",
    patterns: [
      { type: "generator", pattern: /eleventy/i, confidence: 0.95 },
      { type: "comment", pattern: /11ty/i, confidence: 0.7 },
    ],
  },
];

/**
 * Detect SSG from HTML content
 */
export function detectSSG(html: string): SSGResult {
  const signals: string[] = [];
  let bestMatch: { ssg: string; confidence: number } | null = null;

  // Extract generator meta tag
  const generatorMatch = html.match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i
  );
  const generator = generatorMatch?.[1]?.toLowerCase() || "";

  for (const ssgPattern of SSG_PATTERNS) {
    for (const pattern of ssgPattern.patterns) {
      let matched = false;

      if (pattern.type === "generator" && generator) {
        matched = pattern.pattern.test(generator);
        if (matched) signals.push(`generator:${ssgPattern.name}`);
      } else if (pattern.type === "comment") {
        // Check HTML comments
        const commentMatch = html.match(/<!--[\s\S]*?-->/g);
        if (commentMatch) {
          for (const comment of commentMatch) {
            if (pattern.pattern.test(comment)) {
              matched = true;
              signals.push(`comment:${ssgPattern.name}`);
              break;
            }
          }
        }
      } else if (pattern.type === "path") {
        matched = pattern.pattern.test(html);
        if (matched) signals.push(`path:${ssgPattern.name}`);
      } else if (pattern.type === "class") {
        matched = pattern.pattern.test(html);
        if (matched) signals.push(`class:${ssgPattern.name}`);
      } else if (pattern.type === "script") {
        matched = pattern.pattern.test(html);
        if (matched) signals.push(`script:${ssgPattern.name}`);
      }

      if (matched) {
        if (!bestMatch || pattern.confidence > bestMatch.confidence) {
          bestMatch = { ssg: ssgPattern.name, confidence: pattern.confidence };
        }
      }
    }
  }

  return {
    ssg: bestMatch?.ssg || null,
    confidence: bestMatch?.confidence || 0,
    signals,
  };
}

// ============================================================================
// Theme Detection
// ============================================================================

interface ThemePattern {
  name: string;
  ssg: string;
  patterns: Array<{
    type: "class" | "id" | "path";
    pattern: RegExp;
    confidence: number;
  }>;
}

const THEME_PATTERNS: ThemePattern[] = [
  // Hexo themes
  {
    name: "butterfly",
    ssg: "hexo",
    patterns: [
      { type: "class", pattern: /class=["'][^"']*butterfly/i, confidence: 0.9 },
      { type: "id", pattern: /id=["']page-header["']/i, confidence: 0.7 },
    ],
  },
  {
    name: "next",
    ssg: "hexo",
    patterns: [
      { type: "class", pattern: /class=["'][^"']*\bnext\b/i, confidence: 0.85 },
      { type: "class", pattern: /class=["'][^"']*NexT/i, confidence: 0.9 },
    ],
  },
  {
    name: "fluid",
    ssg: "hexo",
    patterns: [
      { type: "id", pattern: /id=["']fluid-container["']/i, confidence: 0.9 },
      { type: "class", pattern: /class=["'][^"']*fluid-container/i, confidence: 0.9 },
    ],
  },
  {
    name: "icarus",
    ssg: "hexo",
    patterns: [
      { type: "class", pattern: /class=["'][^"']*icarus/i, confidence: 0.9 },
      { type: "class", pattern: /is-3-column/i, confidence: 0.6 },
    ],
  },
  {
    name: "volantis",
    ssg: "hexo",
    patterns: [
      { type: "class", pattern: /class=["'][^"']*volantis/i, confidence: 0.9 },
    ],
  },
  {
    name: "matery",
    ssg: "hexo",
    patterns: [
      { type: "class", pattern: /class=["'][^"']*materialize/i, confidence: 0.7 },
      { type: "path", pattern: /matery/i, confidence: 0.8 },
    ],
  },
];

/**
 * Detect theme from HTML content
 */
export function detectTheme(html: string, ssg: string | null): ThemeResult {
  if (!ssg) {
    return { theme: null, confidence: 0 };
  }

  let bestMatch: { theme: string; confidence: number } | null = null;

  for (const themePattern of THEME_PATTERNS) {
    if (themePattern.ssg !== ssg) continue;

    for (const pattern of themePattern.patterns) {
      let matched = false;

      if (pattern.type === "class" || pattern.type === "id") {
        matched = pattern.pattern.test(html);
      } else if (pattern.type === "path") {
        matched = pattern.pattern.test(html);
      }

      if (matched) {
        if (!bestMatch || pattern.confidence > bestMatch.confidence) {
          bestMatch = { theme: themePattern.name, confidence: pattern.confidence };
        }
      }
    }
  }

  return {
    theme: bestMatch?.theme || null,
    confidence: bestMatch?.confidence || 0,
  };
}

// ============================================================================
// Comment System Detection
// ============================================================================

interface CommentSystemPattern {
  name: string;
  patterns: RegExp[];
}

const COMMENT_SYSTEM_PATTERNS: CommentSystemPattern[] = [
  {
    name: "giscus",
    patterns: [/giscus\.app/i, /data-giscus/i, /class=["']giscus["']/i],
  },
  {
    name: "disqus",
    patterns: [/disqus_thread/i, /disqus\.com/i, /disqus_config/i],
  },
  {
    name: "utterances",
    patterns: [/utteranc\.es/i, /utterances/i],
  },
  {
    name: "cusdis",
    patterns: [/cusdis/i, /cusdis_thread/i],
  },
  {
    name: "waline",
    patterns: [/@waline\/client/i, /waline\.js/i, /id=["']waline["']/i],
  },
  {
    name: "twikoo",
    patterns: [/twikoo/i, /tcomment/i],
  },
  {
    name: "artalk",
    patterns: [/artalk/i],
  },
  {
    name: "wordpress",
    patterns: [/wp-comments/i, /comment-respond/i],
  },
];

/**
 * Detect comment system from HTML content
 */
export function detectCommentSystem(html: string): string | null {
  for (const system of COMMENT_SYSTEM_PATTERNS) {
    for (const pattern of system.patterns) {
      if (pattern.test(html)) {
        return system.name;
      }
    }
  }

  return null;
}

// ============================================================================
// Combined Fingerprinting
// ============================================================================

/**
 * Fingerprint a site from its HTML
 */
export function fingerprint(html: string): FingerprintResult {
  const ssgResult = detectSSG(html);
  const themeResult = detectTheme(html, ssgResult.ssg);
  const commentSystem = detectCommentSystem(html);

  // Calculate overall confidence
  let confidence = ssgResult.confidence;
  if (themeResult.theme) {
    confidence = Math.max(confidence, themeResult.confidence);
  }

  return {
    ssg: ssgResult.ssg,
    theme: themeResult.theme,
    commentSystem,
    confidence,
    signals: ssgResult.signals,
  };
}
