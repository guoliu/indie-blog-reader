/**
 * Server-Sent Events (SSE) event emitter.
 * Broadcasts events to all connected clients in real-time.
 */

import type { Article, Blog } from "../indexer/types";

export interface IndexerProgressEvent {
  type: "indexer_progress";
  data: {
    isRunning: boolean;
    totalBlogsIndexed: number;
    newArticlesFound: number;
    errorsEncountered: number;
    currentBlogUrl: string | null;
  };
}

export interface NewArticleEvent {
  type: "new_article";
  data: {
    article: Article;
    blog: {
      id: number;
      name: string | null;
      url: string;
    };
  };
}

export interface ErrorEvent {
  type: "error";
  data: {
    message: string;
    blogUrl: string;
  };
}

export type SSEEvent = IndexerProgressEvent | NewArticleEvent | ErrorEvent;

export class ArticleEventEmitter {
  private clients: Set<{
    controller: ReadableStreamDefaultController;
    language?: string;
  }> = new Set();

  /**
   * Add a new SSE client.
   * @param controller The stream controller for the client
   * @param language Optional language filter for the client
   */
  addClient(
    controller: ReadableStreamDefaultController,
    language?: string
  ): void {
    this.clients.add({ controller, language });
    console.log(
      `[SSE] Client connected (${this.clients.size} total, filter: ${language || "all"})`
    );
  }

  /**
   * Remove a disconnected client.
   */
  removeClient(controller: ReadableStreamDefaultController): void {
    for (const client of this.clients) {
      if (client.controller === controller) {
        this.clients.delete(client);
        break;
      }
    }
    console.log(`[SSE] Client disconnected (${this.clients.size} remaining)`);
  }

  /**
   * Get the number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Emit a new article event to all clients.
   */
  emitNewArticle(article: Article, blog: Blog): void {
    const event: NewArticleEvent = {
      type: "new_article",
      data: {
        article,
        blog: {
          id: blog.id,
          name: blog.name,
          url: blog.url,
        },
      },
    };

    this.broadcast(event, blog.languages);
  }

  /**
   * Emit indexer progress to all clients.
   */
  emitProgress(stats: {
    isRunning: boolean;
    totalBlogsIndexed: number;
    newArticlesFound: number;
    errorsEncountered: number;
    currentBlogUrl: string | null;
  }): void {
    const event: IndexerProgressEvent = {
      type: "indexer_progress",
      data: stats,
    };

    this.broadcast(event);
  }

  /**
   * Emit an error event to all clients.
   */
  emitError(message: string, blogUrl: string): void {
    const event: ErrorEvent = {
      type: "error",
      data: { message, blogUrl },
    };

    this.broadcast(event);
  }

  /**
   * Broadcast an event to all clients, optionally filtered by language.
   */
  private broadcast(event: SSEEvent, blogLanguages?: string[]): void {
    const message = this.formatSSE(event);
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    for (const client of this.clients) {
      try {
        // Filter by language if both client filter and blog languages exist
        if (
          client.language &&
          blogLanguages &&
          !blogLanguages.includes(client.language)
        ) {
          continue;
        }

        client.controller.enqueue(data);
      } catch (error) {
        // Client likely disconnected, will be cleaned up
        console.error("[SSE] Error sending to client:", error);
      }
    }
  }

  /**
   * Format an event as SSE message.
   */
  private formatSSE(event: SSEEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }
}

/**
 * Singleton event emitter instance.
 */
let eventEmitterInstance: ArticleEventEmitter | null = null;

export function getEventEmitter(): ArticleEventEmitter {
  if (!eventEmitterInstance) {
    eventEmitterInstance = new ArticleEventEmitter();
  }
  return eventEmitterInstance;
}

/**
 * Create an SSE response stream.
 */
export function createSSEStream(
  eventEmitter: ArticleEventEmitter,
  language?: string
): Response {
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      eventEmitter.addClient(ctrl, language);

      // Send initial connection message
      const encoder = new TextEncoder();
      ctrl.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      eventEmitter.removeClient(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
