/**
 * Language detection for blogs and articles.
 *
 * Returns an array since sites can be multilingual (e.g., bilingual sites,
 * code-heavy technical blogs, etc.).
 */

// CJK Unicode ranges
const CJK_RANGES = [
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0x20000, 0x2a6df], // CJK Unified Ideographs Extension B
  [0x2a700, 0x2b73f], // CJK Unified Ideographs Extension C
  [0x2b740, 0x2b81f], // CJK Unified Ideographs Extension D
  [0x2b820, 0x2ceaf], // CJK Unified Ideographs Extension E
  [0xf900, 0xfaff], // CJK Compatibility Ideographs
  [0x3000, 0x303f], // CJK Symbols and Punctuation
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
];

// Japanese-specific ranges (Hiragana, Katakana)
const JAPANESE_RANGES = [
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x31f0, 0x31ff], // Katakana Phonetic Extensions
];

// Korean-specific ranges (Hangul)
const KOREAN_RANGES = [
  [0xac00, 0xd7af], // Hangul Syllables
  [0x1100, 0x11ff], // Hangul Jamo
  [0x3130, 0x318f], // Hangul Compatibility Jamo
];

/**
 * Check if a character code is in a range.
 */
function inRanges(code: number, ranges: number[][]): boolean {
  return ranges.some((range) => {
    const start = range[0];
    const end = range[1];
    return start !== undefined && end !== undefined && code >= start && code <= end;
  });
}

/**
 * Calculate character type densities in text.
 */
function calculateDensities(text: string): {
  cjk: number;
  japanese: number;
  korean: number;
  latin: number;
  total: number;
} {
  let cjk = 0;
  let japanese = 0;
  let korean = 0;
  let latin = 0;
  let total = 0;

  for (const char of text) {
    const code = char.codePointAt(0) || 0;

    // Skip whitespace and common punctuation
    if (char.match(/\s/) || char.match(/[.,!?;:'"()\[\]{}]/)) {
      continue;
    }

    total++;

    if (inRanges(code, JAPANESE_RANGES)) {
      japanese++;
      cjk++; // Japanese uses CJK too
    } else if (inRanges(code, KOREAN_RANGES)) {
      korean++;
    } else if (inRanges(code, CJK_RANGES)) {
      cjk++;
    } else if (
      (code >= 0x0041 && code <= 0x005a) || // A-Z
      (code >= 0x0061 && code <= 0x007a) || // a-z
      (code >= 0x00c0 && code <= 0x024f) // Latin Extended
    ) {
      latin++;
    }
  }

  return {
    cjk,
    japanese,
    korean,
    latin,
    total,
  };
}

/**
 * Extract the lang attribute from HTML.
 */
function extractHtmlLang(html: string): string | null {
  // Match <html lang="..."> or <html xml:lang="...">
  const match = html.match(/<html[^>]*(?:lang|xml:lang)=["']([^"']+)["']/i);
  const langCode = match?.[1];
  if (langCode) {
    // Normalize lang code (e.g., "zh-CN" -> "zh", "en-US" -> "en")
    const parts = langCode.split("-");
    return parts[0]?.toLowerCase() ?? null;
  }
  return null;
}

/**
 * Detect language from domain TLD.
 */
function detectFromDomain(url: string): string[] {
  try {
    const domain = new URL(url).hostname;
    const tld = domain.split(".").pop()?.toLowerCase();

    // Chinese TLDs
    if (tld === "cn" || tld === "tw" || tld === "hk") {
      return ["zh"];
    }

    // Japanese TLD
    if (tld === "jp") {
      return ["ja"];
    }

    // Korean TLD
    if (tld === "kr") {
      return ["ko"];
    }

    // German TLD
    if (tld === "de") {
      return ["de"];
    }

    // French TLD
    if (tld === "fr") {
      return ["fr"];
    }
  } catch {
    // Invalid URL
  }

  return [];
}

/**
 * Detect languages from content analysis.
 *
 * Returns array of detected languages based on character density.
 */
function detectFromContent(text: string): string[] {
  const { cjk, japanese, korean, latin, total } = calculateDensities(text);

  if (total < 20) {
    // Not enough content to analyze
    return [];
  }

  const langs: string[] = [];
  const cjkRatio = cjk / total;
  const latinRatio = latin / total;
  const japaneseRatio = japanese / total;
  const koreanRatio = korean / total;

  // If any Japanese kana present (> 1%), likely Japanese
  if (japaneseRatio > 0.01) {
    langs.push("ja");
  }
  // If any Korean hangul present (> 1%), likely Korean
  else if (koreanRatio > 0.01) {
    langs.push("ko");
  }
  // If significant CJK without Japanese/Korean markers, likely Chinese
  else if (cjkRatio > 0.2) {
    langs.push("zh");
  }

  // If significant Latin content
  if (latinRatio > 0.2) {
    langs.push("en");
  }

  return langs;
}

/**
 * Detect languages for a blog or article.
 *
 * Analyzes multiple signals:
 * 1. HTML lang attribute (most reliable when present)
 * 2. Domain TLD hints
 * 3. Content character analysis
 *
 * Returns array of detected languages (sites can be multilingual).
 */
export function detectLanguages(
  html: string,
  url: string,
  rssContent?: string
): string[] {
  const langs = new Set<string>();

  // 1. HTML lang attribute (high confidence)
  const htmlLang = extractHtmlLang(html);
  if (htmlLang) {
    // Map common lang codes
    if (htmlLang === "zh" || htmlLang === "cn") {
      langs.add("zh");
    } else if (htmlLang === "ja" || htmlLang === "jp") {
      langs.add("ja");
    } else if (htmlLang === "ko" || htmlLang === "kr") {
      langs.add("ko");
    } else if (htmlLang === "en") {
      langs.add("en");
    } else {
      langs.add(htmlLang);
    }
  }

  // 2. Domain TLD hints
  const domainLangs = detectFromDomain(url);
  for (const lang of domainLangs) {
    langs.add(lang);
  }

  // 3. Content analysis (combine HTML and RSS content)
  const contentToAnalyze = rssContent
    ? `${html} ${rssContent}`.replace(/<[^>]+>/g, " ")
    : html.replace(/<[^>]+>/g, " ");

  const contentLangs = detectFromContent(contentToAnalyze);
  for (const lang of contentLangs) {
    langs.add(lang);
  }

  // Default to 'en' if no language detected
  if (langs.size === 0) {
    return ["en"];
  }

  return Array.from(langs);
}

/**
 * Detect the primary language of an article's content.
 *
 * Unlike detectLanguages which returns multiple, this returns the
 * most likely single language for display/filtering.
 */
export function detectArticleLanguage(title: string, content: string): string {
  const text = `${title} ${content}`.replace(/<[^>]+>/g, " ");
  const { cjk, japanese, korean, latin, total } = calculateDensities(text);

  if (total < 10) {
    return "en"; // Default
  }

  const cjkRatio = cjk / total;
  const japaneseRatio = japanese / total;
  const koreanRatio = korean / total;

  // Check for Japanese first (has distinct kana)
  if (japaneseRatio > 0.05) {
    return "ja";
  }

  // Check for Korean
  if (koreanRatio > 0.05) {
    return "ko";
  }

  // Check for Chinese (CJK without Japanese/Korean markers)
  if (cjkRatio > 0.3) {
    return "zh";
  }

  return "en";
}
