/**
 * Tests for seed sources.
 */

import { describe, test, expect } from "bun:test";
import {
  SEED_SOURCES,
  getSeedsByLanguage,
  getAvailableLanguages,
} from "../../src/seeds/sources";

describe("SEED_SOURCES", () => {
  test("contains Chinese sources", () => {
    const zhSources = SEED_SOURCES.filter((s) => s.languages.includes("zh"));
    expect(zhSources.length).toBeGreaterThan(0);

    // Should include 开往
    expect(zhSources.some((s) => s.name.includes("开往"))).toBe(true);
    // Should include 十年之约
    expect(zhSources.some((s) => s.name.includes("十年之约"))).toBe(true);
  });

  test("contains English sources", () => {
    const enSources = SEED_SOURCES.filter((s) => s.languages.includes("en"));
    expect(enSources.length).toBeGreaterThan(0);

    // Should include IndieWeb
    expect(enSources.some((s) => s.name.includes("IndieWeb"))).toBe(true);
    // Should include XXIIVV
    expect(enSources.some((s) => s.name.includes("XXIIVV"))).toBe(true);
  });

  test("all sources have required fields", () => {
    for (const source of SEED_SOURCES) {
      expect(source.url).toBeTruthy();
      expect(source.name).toBeTruthy();
      expect(source.type).toBeTruthy();
      expect(source.languages).toBeArray();
      expect(source.languages.length).toBeGreaterThan(0);
    }
  });

  test("all sources have valid types", () => {
    const validTypes = ["circle", "webring", "blogroll", "directory"];
    for (const source of SEED_SOURCES) {
      expect(validTypes).toContain(source.type);
    }
  });
});

describe("getSeedsByLanguage", () => {
  test("returns all sources when no language specified", () => {
    const all = getSeedsByLanguage();
    expect(all).toEqual(SEED_SOURCES);
  });

  test("filters to Chinese sources", () => {
    const zh = getSeedsByLanguage("zh");
    expect(zh.length).toBeGreaterThan(0);
    expect(zh.every((s) => s.languages.includes("zh"))).toBe(true);
  });

  test("filters to English sources", () => {
    const en = getSeedsByLanguage("en");
    expect(en.length).toBeGreaterThan(0);
    expect(en.every((s) => s.languages.includes("en"))).toBe(true);
  });

  test("returns empty array for unknown language", () => {
    const unknown = getSeedsByLanguage("xx");
    expect(unknown).toEqual([]);
  });
});

describe("getAvailableLanguages", () => {
  test("includes both zh and en", () => {
    const langs = getAvailableLanguages();
    expect(langs).toContain("zh");
    expect(langs).toContain("en");
  });

  test("returns sorted array", () => {
    const langs = getAvailableLanguages();
    const sorted = [...langs].sort();
    expect(langs).toEqual(sorted);
  });
});
