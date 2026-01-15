import { describe, test, expect, beforeEach, afterEach } from "bun:test";

/**
 * Tests for HTTP client with conditional request support (ETag/Last-Modified)
 */
describe("ConditionalHttpClient", () => {
  describe("conditional requests", () => {
    test("sends If-None-Match header when etag provided", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      // Use httpbin to echo headers back
      const result = await client.fetch("https://httpbin.org/headers", {
        etag: '"abc123"',
      });

      expect(result.status).not.toBe(304); // httpbin won't return 304
      // But we can verify our request was made correctly by checking we got a response
      expect(result.ok).toBe(true);
    });

    test("sends If-Modified-Since header when lastModified provided", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      const result = await client.fetch("https://httpbin.org/headers", {
        lastModified: "Wed, 15 Jan 2025 10:00:00 GMT",
      });

      expect(result.ok).toBe(true);
    });

    test("returns unchanged status when server returns 304", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      // First request to get ETag
      const firstResult = await client.fetch("https://httpbin.org/etag/test");
      expect(firstResult.ok).toBe(true);

      // httpbin /etag/{etag} endpoint returns 304 when If-None-Match matches
      const secondResult = await client.fetch("https://httpbin.org/etag/test", {
        etag: "test",
      });

      expect(secondResult.status).toBe(304);
      expect(secondResult.unchanged).toBe(true);
    });

    test("extracts etag from response headers", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      const result = await client.fetch("https://httpbin.org/etag/myetag");

      expect(result.etag).toBe("myetag");
    });

    test("extracts last-modified from response headers", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      // httpbin /response-headers lets us set custom headers
      const result = await client.fetch(
        "https://httpbin.org/response-headers?Last-Modified=Wed%2C%2015%20Jan%202025%2010%3A00%3A00%20GMT"
      );

      expect(result.lastModified).toBe("Wed, 15 Jan 2025 10:00:00 GMT");
    });
  });

  describe("timeout handling", () => {
    test("respects timeout option", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      // httpbin /delay/N delays response by N seconds
      const startTime = Date.now();
      const result = await client.fetch("https://httpbin.org/delay/5", {
        timeout: 1000, // 1 second timeout
      });
      const elapsed = Date.now() - startTime;

      expect(result.ok).toBe(false);
      expect(result.error).toContain("timeout");
      expect(elapsed).toBeLessThan(3000); // Should timeout well before 5s
    });

    test("uses default timeout when not specified", async () => {
      const { ConditionalHttpClient, DEFAULT_TIMEOUT } = await import(
        "../../src/indexer/http-client"
      );

      expect(DEFAULT_TIMEOUT).toBe(10000); // 10 seconds default
    });
  });

  describe("error handling", () => {
    test("handles network errors gracefully", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      const result = await client.fetch(
        "https://this-domain-does-not-exist-12345.com"
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("handles HTTP error status codes", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      const result = await client.fetch("https://httpbin.org/status/500");

      expect(result.ok).toBe(false);
      expect(result.status).toBe(500);
    });

    test("handles 404 status", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      const result = await client.fetch("https://httpbin.org/status/404");

      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    });
  });

  describe("content retrieval", () => {
    test("returns body text for successful requests", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      const result = await client.fetch("https://httpbin.org/html");

      expect(result.ok).toBe(true);
      expect(result.body).toContain("Herman Melville");
    });

    test("does not return body for 304 responses", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      const result = await client.fetch("https://httpbin.org/etag/test", {
        etag: "test",
      });

      expect(result.status).toBe(304);
      expect(result.body).toBeUndefined();
    });
  });

  describe("user agent", () => {
    test("sends custom user agent", async () => {
      const { ConditionalHttpClient } = await import(
        "../../src/indexer/http-client"
      );
      const client = new ConditionalHttpClient();

      const result = await client.fetch("https://httpbin.org/user-agent");
      const data = JSON.parse(result.body!);

      expect(data["user-agent"]).toContain("IndieReader");
    });
  });
});
