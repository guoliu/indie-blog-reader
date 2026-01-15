import { describe, test, expect } from "bun:test";

/**
 * Tests for site fingerprinting
 *
 * Detects:
 * - SSG (Static Site Generator)
 * - Theme (for popular SSGs like Hexo)
 * - Comment system
 */
describe("SiteFingerprinter", () => {
  describe("detectSSG", () => {
    test("detects Hexo from generator meta tag", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <html>
          <head>
            <meta name="generator" content="Hexo 6.3.0">
          </head>
        </html>
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("hexo");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test("detects Hugo from generator meta tag", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <meta name="generator" content="Hugo 0.111.3">
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("hugo");
    });

    test("detects WordPress from generator meta tag", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <meta name="generator" content="WordPress 6.4.2">
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("wordpress");
    });

    test("detects Jekyll from generator meta tag", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <meta name="generator" content="Jekyll v4.3.2">
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("jekyll");
    });

    test("detects Ghost from generator meta tag", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <meta name="generator" content="Ghost 5.0">
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("ghost");
    });

    test("detects Hexo from HTML comment", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <!-- hexo-inject:begin -->
        <html></html>
        <!-- hexo-inject:end -->
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("hexo");
    });

    test("detects Hugo from HTML comment", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <!-- Generator: Hugo 0.111 -->
        <html></html>
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("hugo");
    });

    test("detects WordPress from wp-content paths", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <link rel="stylesheet" href="/wp-content/themes/theme/style.css">
        <script src="/wp-includes/js/jquery.js"></script>
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("wordpress");
    });

    test("detects Typecho from patterns", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <meta name="generator" content="Typecho 1.2.1">
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBe("typecho");
    });

    test("returns null for unknown SSG", async () => {
      const { detectSSG } = await import("../../src/indexer/fingerprinter");

      const html = `
        <html>
          <head><title>My Site</title></head>
          <body><p>Hello</p></body>
        </html>
      `;

      const result = detectSSG(html);

      expect(result.ssg).toBeNull();
    });
  });

  describe("detectTheme", () => {
    test("detects Hexo Butterfly theme", async () => {
      const { detectTheme } = await import("../../src/indexer/fingerprinter");

      const html = `
        <html>
          <head>
            <link rel="stylesheet" href="/css/var.css">
          </head>
          <body id="body" class="butterfly">
            <div id="page-header"></div>
          </body>
        </html>
      `;

      const result = detectTheme(html, "hexo");

      expect(result.theme).toBe("butterfly");
    });

    test("detects Hexo NexT theme", async () => {
      const { detectTheme } = await import("../../src/indexer/fingerprinter");

      const html = `
        <html class="next">
          <body class="next-body">
            <div class="post-block next-post"></div>
          </body>
        </html>
      `;

      const result = detectTheme(html, "hexo");

      expect(result.theme).toBe("next");
    });

    test("detects Hexo Fluid theme", async () => {
      const { detectTheme } = await import("../../src/indexer/fingerprinter");

      const html = `
        <html>
          <body>
            <div id="fluid-container" class="fluid-container">
              <header id="navbar"></header>
            </div>
          </body>
        </html>
      `;

      const result = detectTheme(html, "hexo");

      expect(result.theme).toBe("fluid");
    });

    test("detects Hexo Icarus theme", async () => {
      const { detectTheme } = await import("../../src/indexer/fingerprinter");

      const html = `
        <html>
          <body class="is-3-column">
            <div class="icarus-container">
              <section class="section"></section>
            </div>
          </body>
        </html>
      `;

      const result = detectTheme(html, "hexo");

      expect(result.theme).toBe("icarus");
    });

    test("returns null for unknown theme", async () => {
      const { detectTheme } = await import("../../src/indexer/fingerprinter");

      const html = `
        <html>
          <body>
            <div class="custom-theme"></div>
          </body>
        </html>
      `;

      const result = detectTheme(html, "hexo");

      expect(result.theme).toBeNull();
    });

    test("returns null when SSG is not recognized for theme detection", async () => {
      const { detectTheme } = await import("../../src/indexer/fingerprinter");

      const html = `<html><body></body></html>`;

      const result = detectTheme(html, "unknown-ssg");

      expect(result.theme).toBeNull();
    });
  });

  describe("detectCommentSystem", () => {
    test("detects Giscus", async () => {
      const { detectCommentSystem } = await import(
        "../../src/indexer/fingerprinter"
      );

      const html = `
        <script src="https://giscus.app/client.js"
          data-repo="user/repo"
          data-repo-id="xxx"
          data-category="Announcements"
          crossorigin="anonymous"
          async>
        </script>
      `;

      const result = detectCommentSystem(html);

      expect(result).toBe("giscus");
    });

    test("detects Disqus", async () => {
      const { detectCommentSystem } = await import(
        "../../src/indexer/fingerprinter"
      );

      const html = `
        <div id="disqus_thread"></div>
        <script>
          var disqus_config = function () {};
        </script>
      `;

      const result = detectCommentSystem(html);

      expect(result).toBe("disqus");
    });

    test("detects Utterances", async () => {
      const { detectCommentSystem } = await import(
        "../../src/indexer/fingerprinter"
      );

      const html = `
        <script src="https://utteranc.es/client.js"
          repo="user/repo"
          issue-term="pathname"
          theme="github-light"
          crossorigin="anonymous"
          async>
        </script>
      `;

      const result = detectCommentSystem(html);

      expect(result).toBe("utterances");
    });

    test("detects Cusdis", async () => {
      const { detectCommentSystem } = await import(
        "../../src/indexer/fingerprinter"
      );

      const html = `
        <div id="cusdis_thread"
          data-host="https://cusdis.com"
          data-app-id="xxx">
        </div>
      `;

      const result = detectCommentSystem(html);

      expect(result).toBe("cusdis");
    });

    test("detects Waline", async () => {
      const { detectCommentSystem } = await import(
        "../../src/indexer/fingerprinter"
      );

      const html = `
        <div id="waline"></div>
        <script src="https://unpkg.com/@waline/client@v2/dist/waline.js"></script>
      `;

      const result = detectCommentSystem(html);

      expect(result).toBe("waline");
    });

    test("detects Twikoo", async () => {
      const { detectCommentSystem } = await import(
        "../../src/indexer/fingerprinter"
      );

      const html = `
        <div id="tcomment"></div>
        <script src="https://cdn.jsdelivr.net/npm/twikoo@1.6.16/dist/twikoo.all.min.js"></script>
      `;

      const result = detectCommentSystem(html);

      expect(result).toBe("twikoo");
    });

    test("returns null when no comment system detected", async () => {
      const { detectCommentSystem } = await import(
        "../../src/indexer/fingerprinter"
      );

      const html = `<html><body><p>No comments here</p></body></html>`;

      const result = detectCommentSystem(html);

      expect(result).toBeNull();
    });
  });

  describe("fingerprint", () => {
    test("returns full fingerprint with SSG, theme, and comment system", async () => {
      const { fingerprint } = await import("../../src/indexer/fingerprinter");

      const html = `
        <html>
          <head>
            <meta name="generator" content="Hexo 6.3.0">
          </head>
          <body class="butterfly">
            <script src="https://giscus.app/client.js" data-repo="x/y"></script>
          </body>
        </html>
      `;

      const result = fingerprint(html);

      expect(result.ssg).toBe("hexo");
      expect(result.theme).toBe("butterfly");
      expect(result.commentSystem).toBe("giscus");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test("includes detection signals", async () => {
      const { fingerprint } = await import("../../src/indexer/fingerprinter");

      const html = `
        <meta name="generator" content="Hugo 0.111">
      `;

      const result = fingerprint(html);

      expect(result.signals).toContain("generator:hugo");
    });

    test("works with minimal HTML", async () => {
      const { fingerprint } = await import("../../src/indexer/fingerprinter");

      const html = `<html><body></body></html>`;

      const result = fingerprint(html);

      expect(result.ssg).toBeNull();
      expect(result.theme).toBeNull();
      expect(result.commentSystem).toBeNull();
    });
  });
});
