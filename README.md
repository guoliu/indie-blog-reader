# Indie Blog Reader

A local blog monitoring tool that tracks new articles and comment activity across the Chinese independent blog ecosystem.

## Quick Start

```bash
# Install dependencies
bun install
pip install feedparser aiohttp

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
| `bun test` | Run TypeScript tests |
| `bun run migrate` | Import blogs from existing JSONL data |
| `python scraper/main.py refresh --limit 100` | Scrape articles from 100 blogs |
| `python scraper/main.py stats` | Show blog/article counts |

## Architecture

- **Web UI**: Hono + Bun (TypeScript)
- **Scraper**: Python with feedparser for RSS parsing
- **Database**: SQLite

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
