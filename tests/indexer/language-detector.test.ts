/**
 * Tests for language detection.
 */

import { describe, test, expect } from "bun:test";
import {
  detectLanguages,
  detectArticleLanguage,
} from "../../src/indexer/language-detector";

describe("detectLanguages", () => {
  test("detects Chinese from HTML lang attribute", () => {
    const html = '<html lang="zh-CN"><head></head><body>Hello</body></html>';
    const langs = detectLanguages(html, "https://example.com");
    expect(langs).toContain("zh");
  });

  test("detects English from HTML lang attribute", () => {
    const html = '<html lang="en"><head></head><body>Hello</body></html>';
    const langs = detectLanguages(html, "https://example.com");
    expect(langs).toContain("en");
  });

  test("detects Chinese from .cn domain", () => {
    const html = "<html><body>Hello world</body></html>";
    const langs = detectLanguages(html, "https://blog.example.cn");
    expect(langs).toContain("zh");
  });

  test("detects Chinese from .tw domain", () => {
    const html = "<html><body>Hello world</body></html>";
    const langs = detectLanguages(html, "https://blog.example.tw");
    expect(langs).toContain("zh");
  });

  test("detects Japanese from .jp domain", () => {
    const html = "<html><body>Hello world</body></html>";
    const langs = detectLanguages(html, "https://blog.example.jp");
    expect(langs).toContain("ja");
  });

  test("detects Chinese from CJK content", () => {
    const html = `<html><body>
      这是一篇中文博客文章，讨论关于独立博客的话题。
      独立博客是一种很好的表达方式，可以自由地分享自己的想法。
    </body></html>`;
    const langs = detectLanguages(html, "https://example.com");
    expect(langs).toContain("zh");
  });

  test("detects English from Latin content", () => {
    const html = `<html><body>
      This is an English blog post discussing independent blogging.
      Personal blogs are a great way to express yourself and share ideas.
    </body></html>`;
    const langs = detectLanguages(html, "https://example.com");
    expect(langs).toContain("en");
  });

  test("detects multiple languages for bilingual content", () => {
    const html = `<html><body>
      这是一篇双语博客文章。
      This is a bilingual blog post.
      我们可以同时使用中文和英文来表达想法。
      We can express ideas in both Chinese and English.
    </body></html>`;
    const langs = detectLanguages(html, "https://example.com");
    expect(langs).toContain("zh");
    expect(langs).toContain("en");
  });

  test("detects Japanese from hiragana/katakana", () => {
    const html = `<html><body>
      これは日本語のブログ記事です。
      ひらがなとカタカナを使用しています。
    </body></html>`;
    const langs = detectLanguages(html, "https://example.com");
    expect(langs).toContain("ja");
  });

  test("detects Korean from hangul", () => {
    const html = `<html><body>
      이것은 한국어 블로그 게시물입니다.
      개인 블로그는 좋은 표현 방법입니다.
    </body></html>`;
    const langs = detectLanguages(html, "https://example.com");
    expect(langs).toContain("ko");
  });

  test("defaults to English when content is insufficient", () => {
    const html = "<html><body>Hi</body></html>";
    const langs = detectLanguages(html, "https://example.com");
    expect(langs).toContain("en");
  });

  test("combines HTML lang and domain signals", () => {
    const html = '<html lang="en"><body>Hello world</body></html>';
    const langs = detectLanguages(html, "https://example.cn");
    expect(langs).toContain("en");
    expect(langs).toContain("zh");
  });
});

describe("detectArticleLanguage", () => {
  test("detects Chinese article", () => {
    const title = "我的独立博客之旅";
    const content = "今天我想分享一下关于写博客的心得体会。";
    const lang = detectArticleLanguage(title, content);
    expect(lang).toBe("zh");
  });

  test("detects English article", () => {
    const title = "My Indie Blogging Journey";
    const content = "Today I want to share my experience with blogging.";
    const lang = detectArticleLanguage(title, content);
    expect(lang).toBe("en");
  });

  test("detects Japanese article", () => {
    const title = "私のブログについて";
    const content = "今日はブログを書くことについて話したいと思います。";
    const lang = detectArticleLanguage(title, content);
    expect(lang).toBe("ja");
  });

  test("detects Korean article", () => {
    const title = "나의 블로그 이야기";
    const content = "오늘은 블로그 작성 경험을 공유하고 싶습니다.";
    const lang = detectArticleLanguage(title, content);
    expect(lang).toBe("ko");
  });

  test("defaults to English for short content", () => {
    const title = "Hi";
    const content = "Test";
    const lang = detectArticleLanguage(title, content);
    expect(lang).toBe("en");
  });

  test("strips HTML tags before analysis", () => {
    const title = "测试文章";
    const content = "<p>这是一篇<strong>测试</strong>文章的内容。</p>";
    const lang = detectArticleLanguage(title, content);
    expect(lang).toBe("zh");
  });
});
