/**
 * Shared types for SSE events.
 * Enforces contract between emitter, tests, and client.
 */

import type { Article } from "../indexer/types";

/**
 * Indexer progress event data.
 */
export interface IndexerProgressData {
  isRunning: boolean;
  total: number;
  processed: number;
  newArticlesFound: number;
  errorsEncountered: number;
  currentBlog: string | null;
}

/**
 * Blog reference in SSE events (subset of full Blog type).
 */
export interface BlogRef {
  id: number;
  name: string | null;
  url: string;
}

/**
 * New article event data.
 */
export interface NewArticleData {
  article: Article;
  blog: BlogRef;
}

/**
 * New comment event data (article with updated comment count).
 */
export interface NewCommentData {
  article: Article & { comment_count: number };
  blog: BlogRef;
}

/**
 * Error event data.
 */
export interface ErrorData {
  message: string;
  blogUrl: string;
}

/**
 * SSE event types with their data payloads.
 */
export interface IndexerProgressEvent {
  type: "indexer_progress";
  data: IndexerProgressData;
}

export interface NewArticleEvent {
  type: "new_article";
  data: NewArticleData;
}

export interface NewCommentEvent {
  type: "new_comment";
  data: NewCommentData;
}

export interface ErrorEvent {
  type: "error";
  data: ErrorData;
}

export type SSEEvent =
  | IndexerProgressEvent
  | NewArticleEvent
  | NewCommentEvent
  | ErrorEvent;

/**
 * SSE event names as const for type safety.
 */
export const SSE_EVENTS = {
  PROGRESS: "indexer_progress",
  NEW_ARTICLE: "new_article",
  NEW_COMMENT: "new_comment",
  ERROR: "error",
} as const;
