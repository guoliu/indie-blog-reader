# Chinese Independent Blog Mapping - Design

## Purpose
Research and analysis of the Chinese independent blog ecosystem - understanding SSGs used, comment systems, network effects, and community structure.

## Data Model

### Blog Node (blogs.jsonl)
```json
{
  "url": "https://example.com",
  "name": "Blog Name",
  "ssg": "Hugo|Hexo|Astro|...|unknown",
  "theme": "theme-name or null",
  "comment_system": {
    "type": "Giscus|Waline|Twikoo|Disqus|none|...",
    "storage": "GitHub Discussions|self-hosted|...",
    "identity": "GitHub|anonymous|email|..."
  },
  "activity": {
    "article_count": 42,
    "comment_count": 156,
    "last_post_date": "2024-12-01"
  },
  "friend_links": ["url1", "url2"],
  "circles": ["开往", "十年之约"],
  "scraped_at": "2025-01-13T10:00:00Z",
  "scrape_status": "complete|partial|failed"
}
```

### Circle Node (circles.jsonl)
```json
{
  "name": "开往",
  "url": "https://www.travellings.cn/",
  "member_count": 500,
  "members": ["url1", "url2"],
  "scraped_at": "..."
}
```

### Edges (edges.csv)
- `source,target,type` where type is `friend_link` or `circle_member`

## Detection Strategy

### SSG Detection (in order)
1. Meta generator tags
2. HTML signatures (Hexo, Hugo, Astro, VitePress, Gatsby, Next.js)
3. CSS/JS paths
4. Response headers

### Comment System Signatures
| System | Signature |
|--------|-----------|
| Giscus | `giscus.app`, `data-repo` |
| Waline | `waline`, `data-server-url` |
| Twikoo | `twikoo`, `envId` |
| Artalk | `artalk`, `Artalk.init` |
| Disqus | `disqus.com` |
| Utterances | `utteranc.es` |

### Activity Metrics
- Article count: Parse archive/sitemap pages
- Comment count: When visible on page or API exposed

## Directory Structure
```
Independent Blog Circles/
├── 中文.md                 # Seed URLs
├── design.md              # This file
├── scripts/
│   ├── scraper.py         # Main scraper
│   ├── detectors.py       # SSG/comment detection
│   └── utils.py           # Helpers
├── data/
│   ├── blogs.jsonl        # Blog nodes
│   ├── circles.jsonl      # Circle nodes
│   ├── edges.csv          # Relationships
│   ├── queue.txt          # URLs to scrape
│   └── failed.txt         # Failed URLs
├── exports/
│   └── graph.gexf         # Gephi export
└── logs/
    └── scrape.log
```

## Workflow

1. **Seed** - Initialize queue from 中文.md
2. **Scrape batch** - Process ~50 URLs per batch
3. **Review** - Claude Code reviews results, identifies issues
4. **Adjust** - Update detection patterns as needed
5. **Repeat** - Continue until 1000+ blogs collected
6. **Export** - Generate GEXF for Gephi visualization

## Visualization (Gephi)
- Format: GEXF
- Node size: article/comment count
- Node color: SSG type
- Edge color: relationship type
- Goal: Reveal community clusters

## Tech Stack
- Python (requests, BeautifulSoup, httpx)
- GEXF export for Gephi
