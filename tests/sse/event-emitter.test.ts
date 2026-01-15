/**
 * Tests for SSE event emitter.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  ArticleEventEmitter,
  getEventEmitter,
  createSSEStream,
} from "../../src/sse/event-emitter";
import type { IndexerProgressData } from "../../src/sse/types";
import type { Article, Blog } from "../../src/indexer/types";

describe("ArticleEventEmitter", () => {
  let emitter: ArticleEventEmitter;

  beforeEach(() => {
    emitter = new ArticleEventEmitter();
  });

  test("tracks connected clients", () => {
    expect(emitter.getClientCount()).toBe(0);

    // Create mock controllers
    const mockController1 = {
      enqueue: () => {},
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    const mockController2 = {
      enqueue: () => {},
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    emitter.addClient(mockController1);
    expect(emitter.getClientCount()).toBe(1);

    emitter.addClient(mockController2);
    expect(emitter.getClientCount()).toBe(2);

    emitter.removeClient(mockController1);
    expect(emitter.getClientCount()).toBe(1);

    emitter.removeClient(mockController2);
    expect(emitter.getClientCount()).toBe(0);
  });

  test("broadcasts new article events", () => {
    const receivedMessages: string[] = [];

    const mockController = {
      enqueue: (data: Uint8Array) => {
        receivedMessages.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    emitter.addClient(mockController);

    const article: Article = {
      title: "Test Article",
      url: "https://example.com/post",
      description: "Test description",
      cover_image: null,
      language: null,
      published_at: "2025-01-14",
    };

    const blog: Blog = {
      id: 1,
      url: "https://example.com",
      name: "Test Blog",
      ssg: null,
      comment_system: null,
      rss_url: null,
      languages: ["zh"],
      last_scraped_at: null,
      error_count: 0,
      last_error: null,
    };

    emitter.emitNewArticle(article, blog);

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0]).toContain("event: new_article");
    expect(receivedMessages[0]).toContain("Test Article");
    expect(receivedMessages[0]).toContain("Test Blog");
  });

  test("broadcasts progress events", () => {
    const receivedMessages: string[] = [];

    const mockController = {
      enqueue: (data: Uint8Array) => {
        receivedMessages.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    emitter.addClient(mockController);

    const progress: IndexerProgressData = {
      isRunning: true,
      total: 100,
      processed: 50,
      newArticlesFound: 10,
      errorsEncountered: 5,
      currentBlog: "https://example.com",
    };
    emitter.emitProgress(progress);

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0]).toContain("event: indexer_progress");
    expect(receivedMessages[0]).toContain('"total":100');
    expect(receivedMessages[0]).toContain('"processed":50');
  });

  test("broadcasts error events", () => {
    const receivedMessages: string[] = [];

    const mockController = {
      enqueue: (data: Uint8Array) => {
        receivedMessages.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    emitter.addClient(mockController);

    emitter.emitError("Connection timeout", "https://broken.com");

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0]).toContain("event: error");
    expect(receivedMessages[0]).toContain("Connection timeout");
    expect(receivedMessages[0]).toContain("https://broken.com");
  });

  test("filters articles by language", () => {
    const zhMessages: string[] = [];
    const enMessages: string[] = [];
    const allMessages: string[] = [];

    const zhController = {
      enqueue: (data: Uint8Array) => {
        zhMessages.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    const enController = {
      enqueue: (data: Uint8Array) => {
        enMessages.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    const allController = {
      enqueue: (data: Uint8Array) => {
        allMessages.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    emitter.addClient(zhController, "zh");
    emitter.addClient(enController, "en");
    emitter.addClient(allController); // No filter

    const zhArticle: Article = {
      title: "中文文章",
      url: "https://zh.example.com/post",
      description: "中文描述",
      cover_image: null,
      language: "zh",
      published_at: "2025-01-14",
    };

    const zhBlog: Blog = {
      id: 1,
      url: "https://zh.example.com",
      name: "中文博客",
      ssg: null,
      comment_system: null,
      rss_url: null,
      languages: ["zh"],
      last_scraped_at: null,
      error_count: 0,
      last_error: null,
    };

    emitter.emitNewArticle(zhArticle, zhBlog);

    // Chinese client and "all" client should receive it
    expect(zhMessages.length).toBe(1);
    expect(enMessages.length).toBe(0); // English client shouldn't get it
    expect(allMessages.length).toBe(1);
  });

  test("handles disconnected clients gracefully", () => {
    const errorController = {
      enqueue: () => {
        throw new Error("Client disconnected");
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    emitter.addClient(errorController);

    // Should not throw even though client throws on enqueue
    const progress: IndexerProgressData = {
      isRunning: true,
      total: 0,
      processed: 0,
      newArticlesFound: 0,
      errorsEncountered: 0,
      currentBlog: null,
    };
    expect(() => {
      emitter.emitProgress(progress);
    }).not.toThrow();
  });

  test("broadcasts to multiple clients", () => {
    const messages1: string[] = [];
    const messages2: string[] = [];

    const controller1 = {
      enqueue: (data: Uint8Array) => {
        messages1.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    const controller2 = {
      enqueue: (data: Uint8Array) => {
        messages2.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    emitter.addClient(controller1);
    emitter.addClient(controller2);

    const progress: IndexerProgressData = {
      isRunning: false,
      total: 10,
      processed: 10,
      newArticlesFound: 5,
      errorsEncountered: 0,
      currentBlog: null,
    };
    emitter.emitProgress(progress);

    expect(messages1.length).toBe(1);
    expect(messages2.length).toBe(1);
    expect(messages1[0]).toBe(messages2[0]);
  });

  test("emits new_comment events", () => {
    const receivedMessages: string[] = [];

    const mockController = {
      enqueue: (data: Uint8Array) => {
        receivedMessages.push(new TextDecoder().decode(data));
      },
      close: () => {},
      error: () => {},
      desiredSize: 0,
    } as unknown as ReadableStreamDefaultController;

    emitter.addClient(mockController);

    const article = {
      title: "Test Article",
      url: "https://example.com/post",
      description: "Test description",
      cover_image: null,
      language: null,
      published_at: "2025-01-14",
      comment_count: 5,
    };

    const blog: Blog = {
      id: 1,
      url: "https://example.com",
      name: "Test Blog",
      ssg: null,
      comment_system: null,
      rss_url: null,
      languages: ["en"],
      last_scraped_at: null,
      error_count: 0,
      last_error: null,
    };

    emitter.emitNewComment(article, blog);

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0]).toContain("event: new_comment");
    expect(receivedMessages[0]).toContain("Test Article");
    expect(receivedMessages[0]).toContain('"comment_count":5');
  });
});

describe("getEventEmitter", () => {
  test("returns singleton instance", () => {
    const emitter1 = getEventEmitter();
    const emitter2 = getEventEmitter();

    expect(emitter1).toBe(emitter2);
  });
});

describe("createSSEStream", () => {
  test("creates a Response with correct headers", () => {
    const emitter = new ArticleEventEmitter();
    const response = createSSEStream(emitter);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("Connection")).toBe("keep-alive");
  });

  test("creates a Response with language filter", () => {
    const emitter = new ArticleEventEmitter();
    const response = createSSEStream(emitter, "zh");

    expect(response).toBeInstanceOf(Response);
    // The filter is applied internally when adding the client
  });
});
