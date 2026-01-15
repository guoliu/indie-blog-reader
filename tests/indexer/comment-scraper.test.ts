/**
 * Tests for comment scraper.
 */

import { describe, test, expect } from "bun:test";
import {
  detectCommentSystem,
  parseGiscusComments,
  parseDisqusComments,
  parseUtterancesComments,
  parseWordPressComments,
  scrapeCommentsFromHtml,
} from "../../src/indexer/comment-scraper";

describe("detectCommentSystem", () => {
  test("detects Giscus", () => {
    const html = `<div class="giscus" data-repo="user/repo"></div>`;
    expect(detectCommentSystem(html)).toBe("giscus");
  });

  test("detects Giscus with data attribute", () => {
    const html = `<script data-giscus-loaded="true"></script>`;
    expect(detectCommentSystem(html)).toBe("giscus");
  });

  test("detects Disqus", () => {
    const html = `<div id="disqus_thread"></div>`;
    expect(detectCommentSystem(html)).toBe("disqus");
  });

  test("detects Utterances", () => {
    const html = `<script src="https://utteranc.es/client.js"></script>`;
    expect(detectCommentSystem(html)).toBe("utterances");
  });

  test("detects WordPress", () => {
    const html = `<div id="comment-respond"></div>`;
    expect(detectCommentSystem(html)).toBe("wordpress");
  });

  test("detects Cusdis", () => {
    const html = `<div id="cusdis_thread"></div>`;
    expect(detectCommentSystem(html)).toBe("cusdis");
  });

  test("returns null for unknown system", () => {
    const html = `<div class="comments"></div>`;
    expect(detectCommentSystem(html)).toBeNull();
  });
});

describe("parseGiscusComments", () => {
  test("extracts count from data-discussion-count", () => {
    const html = `<div class="giscus" data-discussion-count="5"></div>`;
    expect(parseGiscusComments(html)).toBe(5);
  });

  test("extracts count from data-discussion-count with quotes", () => {
    const html = `<span data-discussion-count='12'></span>`;
    expect(parseGiscusComments(html)).toBe(12);
  });

  test("returns 0 when Giscus is present but no count", () => {
    const html = `<div class="giscus" data-repo="user/repo"></div>`;
    expect(parseGiscusComments(html)).toBe(0);
  });

  test("returns 0 when giscus.app script present", () => {
    const html = `<script src="https://giscus.app/client.js"></script>`;
    expect(parseGiscusComments(html)).toBe(0);
  });

  test("returns null when no Giscus", () => {
    const html = `<div class="comments">No comments</div>`;
    expect(parseGiscusComments(html)).toBeNull();
  });
});

describe("parseDisqusComments", () => {
  test("extracts count from disqus-comment-count element", () => {
    const html = `<a class="disqus-comment-count">3 Comments</a>`;
    expect(parseDisqusComments(html)).toBe(3);
  });

  test("extracts count from disqus_thread link", () => {
    const html = `<a href="#disqus_thread">5</a>`;
    expect(parseDisqusComments(html)).toBe(5);
  });

  test("returns 0 when Disqus is present but no count", () => {
    const html = `<div id="disqus_thread"></div>`;
    expect(parseDisqusComments(html)).toBe(0);
  });

  test("returns null when no Disqus", () => {
    const html = `<div class="comments">No comments</div>`;
    expect(parseDisqusComments(html)).toBeNull();
  });
});

describe("parseUtterancesComments", () => {
  test("returns 0 when Utterances is present", () => {
    const html = `<script src="https://utteranc.es/client.js"></script>`;
    expect(parseUtterancesComments(html)).toBe(0);
  });

  test("returns null when no Utterances", () => {
    const html = `<div class="comments">No comments</div>`;
    expect(parseUtterancesComments(html)).toBeNull();
  });
});

describe("parseWordPressComments", () => {
  test("extracts count from comments-link", () => {
    const html = `<a class="comments-link">7 Comments</a>`;
    expect(parseWordPressComments(html)).toBe(7);
  });

  test("extracts count from comment header", () => {
    const html = `<h3>4 thoughts on "Post Title"</h3>`;
    expect(parseWordPressComments(html)).toBe(4);
  });

  test("counts comment list items", () => {
    const html = `
      <ol class="comment-list">
        <li class="comment">First</li>
        <li class="comment">Second</li>
        <li class="comment">Third</li>
      </ol>
    `;
    expect(parseWordPressComments(html)).toBe(3);
  });

  test("returns null when no WordPress comments", () => {
    const html = `<div class="content">Article content</div>`;
    expect(parseWordPressComments(html)).toBeNull();
  });
});

describe("scrapeCommentsFromHtml", () => {
  test("uses known system parser when provided", () => {
    const html = `<div data-discussion-count="10"></div>`;
    const result = scrapeCommentsFromHtml(html, "giscus");
    expect(result).toEqual({ count: 10, system: "giscus" });
  });

  test("auto-detects system when not provided", () => {
    const html = `<div id="disqus_thread"></div>`;
    const result = scrapeCommentsFromHtml(html);
    expect(result).toEqual({ count: 0, system: "disqus" });
  });

  test("returns null when no comment system found", () => {
    const html = `<div class="content">Just content</div>`;
    const result = scrapeCommentsFromHtml(html);
    expect(result).toBeNull();
  });

  test("prefers known system over detected", () => {
    // HTML has both Giscus and Disqus markers
    const html = `
      <div class="giscus" data-discussion-count="5"></div>
      <div id="disqus_thread"></div>
    `;
    // When we specify giscus as known, it should use that
    const result = scrapeCommentsFromHtml(html, "giscus");
    expect(result?.system).toBe("giscus");
    expect(result?.count).toBe(5);
  });
});
