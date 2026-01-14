/**
 * Unified seed sources for blog discovery.
 *
 * All seeds are in one network - Chinese and English circles connect naturally
 * through friend links. Sites can have multiple languages.
 */

import type { SeedSource } from "../indexer/types";

/**
 * Seed sources for discovering new indie blogs.
 *
 * Types:
 * - circle: A community of blogs that link to each other (e.g., 开往, 十年之约)
 * - webring: A ring of sites with "next/prev" navigation
 * - blogroll: A curated list of recommended blogs
 * - directory: A categorized index of blogs
 */
export const SEED_SOURCES: SeedSource[] = [
  // ============================================
  // Chinese Indie Blog Circles
  // ============================================

  {
    url: "https://www.travellings.cn",
    name: "开往 Travellings",
    type: "circle",
    languages: ["zh"],
  },
  {
    url: "https://foreverblog.cn",
    name: "十年之约",
    type: "circle",
    languages: ["zh"],
  },
  {
    url: "https://blogwe.com",
    name: "博客志",
    type: "directory",
    languages: ["zh"],
  },
  {
    url: "https://storeweb.cn",
    name: "个站商店",
    type: "directory",
    languages: ["zh"],
  },

  // ============================================
  // English Indie Blog Communities
  // ============================================

  {
    url: "https://xn--sr8hvo.ws/directory",
    name: "IndieWeb Webring",
    type: "webring",
    languages: ["en"],
  },
  {
    url: "https://indieseek.xyz/links/",
    name: "Indieseek Links",
    type: "directory",
    languages: ["en"],
  },
  {
    url: "https://webring.xxiivv.com/",
    name: "XXIIVV Webring",
    type: "webring",
    languages: ["en"],
  },
  {
    url: "https://personalsit.es",
    name: "personalsit.es",
    type: "directory",
    languages: ["en"],
  },
  {
    url: "https://ooh.directory/",
    name: "ooh.directory",
    type: "directory",
    languages: ["en"],
  },
  {
    url: "https://blogroll.org",
    name: "Ye Olde Blogroll",
    type: "directory",
    languages: ["en"],
  },

  // ============================================
  // Mixed/Multilingual Communities
  // ============================================

  {
    url: "https://github.com/timqian/chinese-independent-blogs",
    name: "Chinese Independent Blogs List",
    type: "directory",
    languages: ["zh"],
  },
];

/**
 * Get seed sources filtered by language.
 */
export function getSeedsByLanguage(language?: string): SeedSource[] {
  if (!language) return SEED_SOURCES;
  return SEED_SOURCES.filter((s) => s.languages.includes(language));
}

/**
 * Get all unique languages from seed sources.
 */
export function getAvailableLanguages(): string[] {
  const langs = new Set<string>();
  for (const source of SEED_SOURCES) {
    for (const lang of source.languages) {
      langs.add(lang);
    }
  }
  return Array.from(langs).sort();
}
