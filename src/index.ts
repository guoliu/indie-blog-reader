import { createApp } from "./app";
import { ArticleEventEmitter } from "./sse/event-emitter";
import { BlogIndexer } from "./indexer/scheduler";

const port = process.env.PORT || 3000;

// Create the event emitter for SSE broadcasting
const eventEmitter = new ArticleEventEmitter();

// Create the app with the event emitter
const { app, db } = createApp({ eventEmitter });

// Create and start the background indexer
const indexer = new BlogIndexer(
  db,
  {
    crawlIntervalMs: 5000, // Check a blog every 5 seconds
    minRecheckIntervalHours: 6, // 6 hours before rechecking same blog
  },
  {
    // Connect indexer events to SSE emitter
    onNewArticle: (article, blog) => {
      eventEmitter.emitNewArticle(article, blog);
    },
    onProgress: (stats) => {
      eventEmitter.emitProgress(stats);
    },
    onError: (error, blog) => {
      eventEmitter.emitError(error.message, blog.url);
    },
  }
);

// Start the indexer when the server starts
indexer.start();
console.log("Background indexer started (checking blogs every 5 seconds)");

console.log(`Starting Indie Blog Reader on http://localhost:${port}`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  indexer.stop();
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  indexer.stop();
  db.close();
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
  // Allow long-running requests (max is 255 seconds)
  idleTimeout: 255,
};
