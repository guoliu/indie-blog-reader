# Indie Blog Reader

A real-time blog monitoring tool that tracks new articles and comment activity across independent blogs in multiple languages.

## Features

- **Real-time Updates**: Server-Sent Events (SSE) push new articles to connected clients instantly
- **Multi-language Support**: Filter blogs by language (Chinese, English, or all)
- **Parallel Indexing**: Concurrent batch indexer processes thousands of blogs efficiently
- **Language Detection**: Automatic detection via HTML lang attributes, domain TLDs, and character analysis
- **Blog Discovery**: Scrapes webrings and directories to discover new indie blogs
- **Comment Tracking**: Monitor comment counts across articles (supports Giscus, Disqus, Utterances)

## Quick Start

```bash
# Install dependencies
bun install

# Create data directory and migrate existing blog data
mkdir -p data
bun run migrate

# Start the server
bun run dev
```

Open http://localhost:3000 to view the reader.

## Commands

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with hot reload |
| `bun test` | Run all tests |
| `bun run migrate` | Import blogs from existing JSONL data |

## API Endpoints

### Batch Indexer
- `POST /api/batch/start` - Start parallel blog indexing
  - Query params: `concurrency` (default: 5), `timeout` (default: 30000ms)
- `POST /api/batch/stream` - Stream indexer progress via SSE
- `POST /api/batch/cancel` - Cancel running indexer

### Discovery
- `POST /api/discovery/run` - Discover blogs from seed sources (webrings, directories)
  - Query params: `lang` (optional: "en" or "zh")
- `POST /api/blogs/detect-languages` - Re-detect languages for existing blogs
  - Query params: `limit` (default: 100)

### Data
- `GET /api/articles` - List articles
  - Query params: `filter` (latest, comments), `lang` (zh, en)
- `GET /api/blogs` - List all blogs
- `POST /api/blogs` - Add a new blog
- `GET /api/events` - SSE stream for real-time updates

## Architecture

```
src/
├── app.ts              # Hono server and API routes
├── db.ts               # SQLite database schema
├── views/              # HTML templates
│   └── homepage.ts     # Main page with SSE client
├── indexer/
│   ├── batch-indexer.ts    # Parallel blog crawler
│   ├── rss-fetcher.ts      # RSS feed parser
│   ├── language-detector.ts # Language detection
│   ├── seed-discovery.ts   # Blog discovery from webrings
│   ├── seed-scraper.ts     # Extract URLs from directories
│   └── comment-scraper.ts  # Comment count extraction
├── sse/
│   ├── event-emitter.ts    # SSE broadcasting
│   └── types.ts            # Shared type definitions
└── seeds/
    └── sources.ts          # Seed source definitions
```

## Seed Sources

English:
- IndieWeb Webring
- XXIIVV Webring
- personalsit.es
- ooh.directory
- Ye Olde Blogroll
- Indieseek Links

Chinese:
- 开往 Travellings
- 十年之约
- 博客志
- 个站商店
- Chinese Independent Blogs List

## Database

SQLite database at `data/blog-monitor.db`:

| Table | Description |
|-------|-------------|
| `blogs` | Blog URLs, names, detected languages |
| `articles` | Article metadata (title, description, date) |
| `comment_snapshots` | Historical comment counts |

## Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/indexer/batch-indexer.test.ts

# Run e2e tests (requires Playwright)
bun run test:e2e
```

## Troubleshooting

**Port 3000 in use:**
```bash
lsof -ti:3000 | xargs kill -9
# Or use a different port:
PORT=3001 bun run dev
```

**Bun not found:**
```bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

## Scripts

Migration scripts in `scripts/`:
- `fix-languages.ts` - Re-detect languages for existing blogs/articles

Run with: `bun run scripts/fix-languages.ts`
