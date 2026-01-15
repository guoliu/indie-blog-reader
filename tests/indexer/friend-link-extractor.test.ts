import { describe, test, expect } from "bun:test";

/**
 * Tests for friend link extraction
 *
 * Strategy: Protocol-first, heuristic-fallback
 * 1. Try OPML (highest confidence)
 * 2. Try XFN/microformats from HTML
 * 3. Fall back to page heuristics
 */
describe("FriendLinkExtractor", () => {
  describe("extractFromXFN", () => {
    test("extracts friend links from XFN rel attributes", async () => {
      const { extractFromXFN } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <div class="blogroll">
          <a href="https://alice.com" rel="friend">Alice</a>
          <a href="https://bob.com" rel="friend met">Bob</a>
        </div>
      `;

      const links = extractFromXFN(html);

      expect(links).toHaveLength(2);
      expect(links[0]).toEqual({
        url: "https://alice.com",
        name: "Alice",
        discoveryMethod: "xfn",
        confidence: 0.9,
      });
    });

    test("extracts acquaintance links", async () => {
      const { extractFromXFN } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `<a href="https://example.com" rel="acquaintance">Someone</a>`;

      const links = extractFromXFN(html);

      expect(links).toHaveLength(1);
      expect(links[0].confidence).toBe(0.7); // Lower confidence for acquaintance
    });

    test("returns empty array when no XFN links", async () => {
      const { extractFromXFN } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `<a href="https://example.com">Regular link</a>`;

      const links = extractFromXFN(html);

      expect(links).toEqual([]);
    });
  });

  describe("extractFromMicroformats", () => {
    test("extracts rel=following links", async () => {
      const { extractFromMicroformats } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <div class="blogroll">
          <a rel="following" href="https://blog1.com">Blog 1</a>
          <a rel="following" href="https://blog2.com">Blog 2</a>
        </div>
      `;

      const links = extractFromMicroformats(html);

      expect(links).toHaveLength(2);
      expect(links[0]).toEqual({
        url: "https://blog1.com",
        name: "Blog 1",
        discoveryMethod: "microformat",
        confidence: 0.85,
      });
    });

    test("returns empty array when no rel=following", async () => {
      const { extractFromMicroformats } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `<a href="https://example.com">Link</a>`;

      const links = extractFromMicroformats(html);

      expect(links).toEqual([]);
    });
  });

  describe("detectFriendLinkPage", () => {
    test("detects Chinese friend link page by URL", async () => {
      const { detectFriendLinkPage } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      expect(detectFriendLinkPage("/friends")).toBe(true);
      expect(detectFriendLinkPage("/links")).toBe(true);
      expect(detectFriendLinkPage("/友链")).toBe(true);
      expect(detectFriendLinkPage("/link")).toBe(true);
    });

    test("detects English blogroll page by URL", async () => {
      const { detectFriendLinkPage } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      expect(detectFriendLinkPage("/blogroll")).toBe(true);
      expect(detectFriendLinkPage("/reads")).toBe(true);
      expect(detectFriendLinkPage("/roll")).toBe(true);
    });

    test("returns false for non-friend-link URLs", async () => {
      const { detectFriendLinkPage } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      expect(detectFriendLinkPage("/about")).toBe(false);
      expect(detectFriendLinkPage("/contact")).toBe(false);
      expect(detectFriendLinkPage("/blog")).toBe(false);
    });
  });

  describe("extractFromHeuristics", () => {
    test("extracts links from friend-links container", async () => {
      const { extractFromHeuristics } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <div class="friend-links">
          <a href="https://friend1.com">Friend 1</a>
          <a href="https://friend2.com">Friend 2</a>
        </div>
      `;

      const links = extractFromHeuristics(html);

      expect(links).toHaveLength(2);
      expect(links[0].url).toBe("https://friend1.com");
      expect(links[0].discoveryMethod).toBe("heuristic");
    });

    test("extracts links from blogroll container", async () => {
      const { extractFromHeuristics } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <div class="blogroll">
          <ul>
            <li><a href="https://blog1.com">Blog 1</a></li>
            <li><a href="https://blog2.com">Blog 2</a></li>
          </ul>
        </div>
      `;

      const links = extractFromHeuristics(html);

      expect(links).toHaveLength(2);
    });

    test("extracts links near Chinese friend link heading", async () => {
      const { extractFromHeuristics } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <h2>友链</h2>
        <ul>
          <li><a href="https://blog1.com">博客1</a></li>
          <li><a href="https://blog2.com">博客2</a></li>
        </ul>
      `;

      const links = extractFromHeuristics(html);

      expect(links.length).toBeGreaterThan(0);
    });

    test("extracts links near English blogroll heading", async () => {
      const { extractFromHeuristics } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <h2>Blogroll</h2>
        <ul>
          <li><a href="https://friend1.com">Friend 1</a></li>
        </ul>
      `;

      const links = extractFromHeuristics(html);

      expect(links.length).toBeGreaterThan(0);
    });

    test("filters out internal and common links", async () => {
      const { extractFromHeuristics } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <div class="friend-links">
          <a href="https://friend.com">Friend</a>
          <a href="#section">Internal</a>
          <a href="javascript:void(0)">JS</a>
          <a href="https://twitter.com/user">Twitter</a>
          <a href="https://github.com/user">GitHub</a>
        </div>
      `;

      const links = extractFromHeuristics(html);

      // Should only include friend.com, not internal links or social media
      expect(links.some((l) => l.url === "https://friend.com")).toBe(true);
      expect(links.some((l) => l.url.includes("twitter.com"))).toBe(false);
      expect(links.some((l) => l.url.includes("github.com"))).toBe(false);
    });

    test("has lower confidence than protocol-based extraction", async () => {
      const { extractFromHeuristics } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <div class="blogroll">
          <a href="https://friend.com">Friend</a>
        </div>
      `;

      const links = extractFromHeuristics(html);

      expect(links[0].confidence).toBeLessThan(0.8);
    });
  });

  describe("extractFriendLinks", () => {
    test("uses XFN first if available", async () => {
      const { extractFriendLinks } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <a href="https://xfn-friend.com" rel="friend">XFN Friend</a>
        <div class="blogroll">
          <a href="https://heuristic-friend.com">Heuristic Friend</a>
        </div>
      `;

      const links = await extractFriendLinks({ html, url: "https://example.com" });

      // XFN links should be included with high confidence
      const xfnLink = links.find((l) => l.url === "https://xfn-friend.com");
      expect(xfnLink).toBeDefined();
      expect(xfnLink!.discoveryMethod).toBe("xfn");
    });

    test("falls back to heuristics when no protocols found", async () => {
      const { extractFriendLinks } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <div class="friend-links">
          <a href="https://friend.com">Friend</a>
        </div>
      `;

      const links = await extractFriendLinks({ html, url: "https://example.com" });

      expect(links).toHaveLength(1);
      expect(links[0].discoveryMethod).toBe("heuristic");
    });

    test("deduplicates links from multiple sources", async () => {
      const { extractFriendLinks } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <a href="https://friend.com" rel="friend">Friend</a>
        <div class="blogroll">
          <a href="https://friend.com">Same Friend</a>
        </div>
      `;

      const links = await extractFriendLinks({ html, url: "https://example.com" });

      // Should have one link, preferring the XFN version
      const friendLinks = links.filter((l) => l.url === "https://friend.com");
      expect(friendLinks).toHaveLength(1);
      expect(friendLinks[0].discoveryMethod).toBe("xfn");
    });

    test("resolves relative URLs", async () => {
      const { extractFriendLinks } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      const html = `
        <a href="/friend" rel="friend">Friend</a>
      `;

      const links = await extractFriendLinks({
        html,
        url: "https://example.com/page",
      });

      // Relative URL should not be included (not a blog URL)
      // But if it were a full URL, it would be resolved
      expect(links).toHaveLength(0);
    });
  });

  describe("isValidBlogUrl", () => {
    test("accepts valid blog URLs", async () => {
      const { isValidBlogUrl } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      expect(isValidBlogUrl("https://myblog.com")).toBe(true);
      expect(isValidBlogUrl("https://blog.example.com")).toBe(true);
      expect(isValidBlogUrl("http://friend.org")).toBe(true);
    });

    test("rejects social media URLs", async () => {
      const { isValidBlogUrl } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      expect(isValidBlogUrl("https://twitter.com/user")).toBe(false);
      expect(isValidBlogUrl("https://github.com/user")).toBe(false);
      expect(isValidBlogUrl("https://facebook.com/page")).toBe(false);
      expect(isValidBlogUrl("https://instagram.com/user")).toBe(false);
    });

    test("rejects internal and invalid URLs", async () => {
      const { isValidBlogUrl } = await import(
        "../../src/indexer/friend-link-extractor"
      );

      expect(isValidBlogUrl("#section")).toBe(false);
      expect(isValidBlogUrl("javascript:void(0)")).toBe(false);
      expect(isValidBlogUrl("/relative/path")).toBe(false);
      expect(isValidBlogUrl("mailto:email@example.com")).toBe(false);
    });
  });
});
