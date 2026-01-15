import { describe, test, expect } from "bun:test";

/**
 * Tests for protocol detection
 *
 * Detects:
 * - OPML blogrolls
 * - WebMention endpoints
 * - Microformats (h-card, h-feed, rel="me", rel="following")
 * - XFN rel attributes (rel="friend", rel="acquaintance", etc.)
 */
describe("ProtocolDetector", () => {
  describe("detectOPML", () => {
    test("detects OPML link in HTML head", async () => {
      const { detectOPML } = await import("../../src/indexer/protocol-detector");

      const html = `
        <html>
          <head>
            <link rel="blogroll" type="text/x-opml" href="/blogroll.opml" />
          </head>
          <body></body>
        </html>
      `;

      const result = detectOPML(html, "https://example.com");

      expect(result.supported).toBe(true);
      expect(result.url).toBe("https://example.com/blogroll.opml");
    });

    test("detects OPML with alternate rel value", async () => {
      const { detectOPML } = await import("../../src/indexer/protocol-detector");

      const html = `
        <html>
          <head>
            <link rel="alternate" type="text/x-opml" href="/feeds.opml" />
          </head>
          <body></body>
        </html>
      `;

      const result = detectOPML(html, "https://example.com");

      expect(result.supported).toBe(true);
      expect(result.url).toBe("https://example.com/feeds.opml");
    });

    test("resolves relative URLs correctly", async () => {
      const { detectOPML } = await import("../../src/indexer/protocol-detector");

      const html = `
        <head>
          <link rel="blogroll" type="text/x-opml" href="../blogroll.opml" />
        </head>
      `;

      const result = detectOPML(html, "https://example.com/blog/");

      expect(result.url).toBe("https://example.com/blogroll.opml");
    });

    test("returns not supported when no OPML link found", async () => {
      const { detectOPML } = await import("../../src/indexer/protocol-detector");

      const html = `
        <html>
          <head>
            <link rel="stylesheet" href="/style.css" />
          </head>
          <body></body>
        </html>
      `;

      const result = detectOPML(html, "https://example.com");

      expect(result.supported).toBe(false);
      expect(result.url).toBeUndefined();
    });
  });

  describe("detectWebMention", () => {
    test("detects webmention endpoint in link tag", async () => {
      const { detectWebMention } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <html>
          <head>
            <link rel="webmention" href="/webmention" />
          </head>
          <body></body>
        </html>
      `;

      const result = detectWebMention(html, "https://example.com");

      expect(result.supported).toBe(true);
      expect(result.endpoint).toBe("https://example.com/webmention");
    });

    test("detects webmention in anchor tag", async () => {
      const { detectWebMention } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <html>
          <body>
            <a rel="webmention" href="https://webmention.io/example.com/webmention">Send webmention</a>
          </body>
        </html>
      `;

      const result = detectWebMention(html, "https://example.com");

      expect(result.supported).toBe(true);
      expect(result.endpoint).toBe(
        "https://webmention.io/example.com/webmention"
      );
    });

    test("prefers link tag over anchor tag", async () => {
      const { detectWebMention } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <html>
          <head>
            <link rel="webmention" href="/link-endpoint" />
          </head>
          <body>
            <a rel="webmention" href="/anchor-endpoint">Send</a>
          </body>
        </html>
      `;

      const result = detectWebMention(html, "https://example.com");

      expect(result.endpoint).toBe("https://example.com/link-endpoint");
    });

    test("returns not supported when no webmention endpoint found", async () => {
      const { detectWebMention } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `<html><body></body></html>`;

      const result = detectWebMention(html, "https://example.com");

      expect(result.supported).toBe(false);
      expect(result.endpoint).toBeUndefined();
    });
  });

  describe("detectMicroformats", () => {
    test("detects h-card", async () => {
      const { detectMicroformats } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <div class="h-card">
          <span class="p-name">John Doe</span>
          <a class="u-url" href="https://johndoe.com">Website</a>
        </div>
      `;

      const result = detectMicroformats(html);

      expect(result.hCard).toBe(true);
    });

    test("detects h-feed", async () => {
      const { detectMicroformats } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <div class="h-feed">
          <article class="h-entry">
            <h2 class="p-name">Article Title</h2>
          </article>
        </div>
      `;

      const result = detectMicroformats(html);

      expect(result.hFeed).toBe(true);
    });

    test("extracts rel=me links", async () => {
      const { detectMicroformats } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <a rel="me" href="https://twitter.com/johndoe">Twitter</a>
        <a rel="me" href="https://github.com/johndoe">GitHub</a>
      `;

      const result = detectMicroformats(html);

      expect(result.relMe).toContain("https://twitter.com/johndoe");
      expect(result.relMe).toContain("https://github.com/johndoe");
    });

    test("extracts rel=following links", async () => {
      const { detectMicroformats } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <div class="blogroll">
          <a rel="following" href="https://friend1.com">Friend 1</a>
          <a rel="following" href="https://friend2.com">Friend 2</a>
        </div>
      `;

      const result = detectMicroformats(html);

      expect(result.relFollowing).toContain("https://friend1.com");
      expect(result.relFollowing).toContain("https://friend2.com");
    });

    test("handles multiple classes including h-card", async () => {
      const { detectMicroformats } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <div class="author-info h-card vcard">
          <span class="p-name fn">Jane</span>
        </div>
      `;

      const result = detectMicroformats(html);

      expect(result.hCard).toBe(true);
    });
  });

  describe("detectXFN", () => {
    test("extracts friend links", async () => {
      const { detectXFN } = await import("../../src/indexer/protocol-detector");

      const html = `
        <div class="blogroll">
          <a href="https://alice.com" rel="friend">Alice</a>
          <a href="https://bob.com" rel="friend met">Bob</a>
        </div>
      `;

      const result = detectXFN(html);

      expect(result.links).toHaveLength(2);
      expect(result.links[0]).toEqual({
        url: "https://alice.com",
        rel: ["friend"],
      });
      expect(result.links[1]).toEqual({
        url: "https://bob.com",
        rel: ["friend", "met"],
      });
    });

    test("extracts acquaintance and contact links", async () => {
      const { detectXFN } = await import("../../src/indexer/protocol-detector");

      const html = `
        <a href="https://example1.com" rel="acquaintance">Person 1</a>
        <a href="https://example2.com" rel="contact">Person 2</a>
      `;

      const result = detectXFN(html);

      expect(result.links).toContainEqual({
        url: "https://example1.com",
        rel: ["acquaintance"],
      });
      expect(result.links).toContainEqual({
        url: "https://example2.com",
        rel: ["contact"],
      });
    });

    test("ignores non-XFN rel values", async () => {
      const { detectXFN } = await import("../../src/indexer/protocol-detector");

      const html = `
        <a href="https://external.com" rel="external nofollow">External</a>
        <a href="https://friend.com" rel="friend">Friend</a>
      `;

      const result = detectXFN(html);

      expect(result.links).toHaveLength(1);
      expect(result.links[0]?.url).toBe("https://friend.com");
    });

    test("handles mixed XFN and other rel values", async () => {
      const { detectXFN } = await import("../../src/indexer/protocol-detector");

      const html = `
        <a href="https://bob.com" rel="friend external noopener">Bob</a>
      `;

      const result = detectXFN(html);

      expect(result.links).toHaveLength(1);
      expect(result.links[0]?.rel).toEqual(["friend"]);
    });

    test("returns empty array when no XFN links found", async () => {
      const { detectXFN } = await import("../../src/indexer/protocol-detector");

      const html = `<a href="https://example.com">Regular link</a>`;

      const result = detectXFN(html);

      expect(result.links).toEqual([]);
    });
  });

  describe("detectAllProtocols", () => {
    test("detects all protocols in one call", async () => {
      const { detectAllProtocols } = await import(
        "../../src/indexer/protocol-detector"
      );

      const html = `
        <html>
          <head>
            <link rel="blogroll" type="text/x-opml" href="/blogroll.opml" />
            <link rel="webmention" href="/webmention" />
          </head>
          <body>
            <div class="h-card">
              <a class="u-url p-name" href="https://example.com">Example</a>
            </div>
            <a rel="me" href="https://twitter.com/example">Twitter</a>
            <a rel="friend" href="https://friend.com">Friend</a>
          </body>
        </html>
      `;

      const result = detectAllProtocols(html, "https://example.com");

      expect(result.opml.supported).toBe(true);
      expect(result.opml.url).toBe("https://example.com/blogroll.opml");
      expect(result.webmention.supported).toBe(true);
      expect(result.webmention.endpoint).toBe("https://example.com/webmention");
      expect(result.microformats.hCard).toBe(true);
      expect(result.microformats.relMe).toContain(
        "https://twitter.com/example"
      );
      expect(result.xfn.links).toHaveLength(1);
    });
  });
});
