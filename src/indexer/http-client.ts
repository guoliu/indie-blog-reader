/**
 * HTTP client with conditional request support (ETag/Last-Modified)
 *
 * Implements RFC 7232 conditional requests for efficient update checking.
 * - Sends If-None-Match header when etag provided
 * - Sends If-Modified-Since header when lastModified provided
 * - Returns unchanged=true when server responds with 304
 */

export const DEFAULT_TIMEOUT = 10000; // 10 seconds
const USER_AGENT = "Mozilla/5.0 (compatible; IndieReader/1.0)";

export interface FetchOptions {
  /** ETag from previous response - sends If-None-Match header */
  etag?: string;
  /** Last-Modified from previous response - sends If-Modified-Since header */
  lastModified?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
}

export interface FetchResult {
  /** HTTP status code */
  status: number;
  /** True if request succeeded (2xx status) */
  ok: boolean;
  /** True if server returned 304 Not Modified */
  unchanged: boolean;
  /** Response body text (undefined for 304 responses) */
  body?: string;
  /** ETag from response headers */
  etag?: string;
  /** Last-Modified from response headers */
  lastModified?: string;
  /** Error message if request failed */
  error?: string;
}

export class ConditionalHttpClient {
  /**
   * Fetch a URL with optional conditional request headers
   */
  async fetch(url: string, options: FetchOptions = {}): Promise<FetchResult> {
    const { etag, lastModified, timeout = DEFAULT_TIMEOUT } = options;

    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
    };

    if (etag) {
      headers["If-None-Match"] = etag;
    }

    if (lastModified) {
      headers["If-Modified-Since"] = lastModified;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 304 Not Modified
      if (response.status === 304) {
        return {
          status: 304,
          ok: true,
          unchanged: true,
          etag: extractEtag(response),
          lastModified: response.headers.get("Last-Modified") || undefined,
        };
      }

      // Handle error status codes
      if (!response.ok) {
        return {
          status: response.status,
          ok: false,
          unchanged: false,
          error: `HTTP ${response.status}`,
        };
      }

      // Success - return body and headers
      const body = await response.text();

      return {
        status: response.status,
        ok: true,
        unchanged: false,
        body,
        etag: extractEtag(response),
        lastModified: response.headers.get("Last-Modified") || undefined,
      };
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          return {
            status: 0,
            ok: false,
            unchanged: false,
            error: "Request timeout",
          };
        }

        return {
          status: 0,
          ok: false,
          unchanged: false,
          error: err.message,
        };
      }

      return {
        status: 0,
        ok: false,
        unchanged: false,
        error: "Unknown error",
      };
    }
  }
}

/**
 * Extract ETag from response, handling both quoted and unquoted formats
 */
function extractEtag(response: Response): string | undefined {
  const etag = response.headers.get("ETag");
  if (!etag) return undefined;

  // Remove surrounding quotes if present
  return etag.replace(/^"(.*)"$/, "$1").replace(/^W\//, "");
}
