# Chinese Independent Blog Network - Documentation

## Project Overview

This project maps the Chinese independent blog ecosystem by scraping blogs, detecting their technical stack, and discovering network relationships through friend links (友链) and blog circles (圈子).

### Final Dataset Statistics
- **Blogs scraped**: 16,978
- **Friend link edges**: ~67,000
- **Circle membership edges**: 3,079
- **Circles indexed**: 8

## Circles Indexed

| Circle | URL | Members Found | Notes |
|--------|-----|---------------|-------|
| **开往 (Travellings)** | https://www.travellings.cn/ | 1,117 | Public API at `/list` - easy to scrape |
| **chinese-independent-blogs** | GitHub repo | 1,388 | YAML file with curated list |
| **十年之约 (Foreverblog)** | https://www.foreverblog.cn/ | 425 | JS-rendered; scraped via page parsing |
| **笔墨迹 (BlogsCN)** | https://blogscn.fun/ | 147 | Random API only; collected via repeated calls |
| **BlogsClub** | https://www.blogsclub.org/ | 5 | JS-rendered with auth; limited extraction |

*Note: Some circles were scraped multiple times with different methods, resulting in duplicate entries in circles.jsonl.*

## Technical Approach

### 1. Data Collection Pipeline

```
Seed URLs (中文.md, circles)
        ↓
    Queue (queue.txt)
        ↓
  Parallel Scraper (fast_scraper.py)
        ↓
   Detection (detectors.py)
        ↓
  blogs.jsonl + edges.csv
        ↓
  Friend Discovery (discover_friends.py)
        ↓
    New URLs → Queue (loop)
```

### 2. SSG Detection

Detected via HTML signatures, meta tags, and file paths:

| SSG | Detection Method | Count |
|-----|-----------------|-------|
| Hexo | `<meta generator="Hexo">`, `/css/style.css` patterns | 2,547 |
| WordPress | `wp-content/`, meta generator | 2,222 |
| Typecho | `typecho`, `/usr/` paths | 881 |
| Next.js | `_next/`, `__NEXT_DATA__` | 811 |
| VuePress | `vuepress`, `.vuepress/` | 742 |
| Hugo | `<meta generator="Hugo">` | 570 |
| Astro | `astro-island`, `/_astro/` | 569 |
| Halo | `halo`, `/themes/` patterns | 477 |
| Jekyll | `jekyll`, `/jekyll/` | 333 |
| Unknown | Could not detect | 6,821 (40%) |

### 3. Comment System Detection

| System | Signature | Count |
|--------|-----------|-------|
| Twikoo | `twikoo`, `envId` | 583 |
| Waline | `waline`, `data-server-url` | 547 |
| Valine | `valine`, `leancloud` | 500 |
| Isso | `isso-thread` | 186 |
| Disqus | `disqus.com` | 136 |
| Gitalk | `gitalk` | 119 |
| Giscus | `giscus.app` | 114 |
| Utterances | `utteranc.es` | 94 |
| Artalk | `artalk` | 82 |
| None detected | - | 8,816 (52%) |

### 4. Friend Link Discovery

Friend links are discovered by:
1. Checking common paths: `/links`, `/friends`, `/友链`, `/blogroll`
2. Verifying page content contains friend-related keywords
3. Extracting external URLs from the page
4. Filtering to likely blog URLs (excluding CDNs, services, social media)

## Key Learnings

### What Worked Well

1. **Parallel scraping** - ThreadPoolExecutor with 20 workers dramatically improved throughput
2. **URL normalization** - Critical for deduplication (removing www, trailing slashes, normalizing case)
3. **Domain blocklist** - Extensive list prevents scraping CDNs, analytics, and services as blogs
4. **Multiple detection patterns** - Combining meta tags, file paths, and HTML patterns improves SSG detection

### Challenges Encountered

1. **JS-rendered pages** - Many circle member lists require JavaScript execution
   - Solution: Found API endpoints or parsed individual member pages

2. **Rate limiting** - Some sites block rapid requests
   - Solution: Added delays (0.05-0.5s between requests)

3. **Character encoding** - Some blog names appear garbled
   - Cause: Inconsistent encoding detection
   - Impact: Visual only, URLs are correct

4. **Non-blog URLs** - CDNs, services, and social media links got scraped
   - Solution: Comprehensive `is_likely_blog_url()` filter with 50+ blocked domains

5. **Duplicate entries** - Multiple scraping rounds created duplicates
   - Solution: `deduplicate.py` script to clean data

### Circle-Specific Issues

| Circle | Issue | Solution |
|--------|-------|----------|
| 十年之约 | Member list is JS-rendered | Parse individual blog pages for URLs |
| 笔墨迹 | No full member list, only random API | Call random endpoint 500 times |
| BlogsClub | Requires authentication token | Limited extraction from static HTML |

## Data Schema

### blogs.jsonl
```json
{
  "url": "https://example.com",
  "name": "Blog Name",
  "ssg": "hexo|hugo|...|unknown",
  "theme": "theme-name or null",
  "comment_system": {
    "type": "giscus|waline|...|none",
    "storage": "GitHub|self-hosted|...",
    "identity": "GitHub|anonymous|email|..."
  },
  "friend_links": ["url1", "url2"],
  "circles": ["开往", "十年之约"],
  "scraped_at": "2025-01-13T10:00:00Z",
  "scrape_status": "complete|partial|failed"
}
```

### edges.csv
```csv
source,target,type
https://blog-a.com,https://blog-b.com,friend_link
https://blog-a.com,https://travellings.cn,circle_member
```

## Visualization Recommendations

### For Cluster Discovery

**Gephi** (gephi.org)
- Best for: Community detection, modularity analysis
- Features:
  - Modularity algorithm reveals clusters
  - Force Atlas 2 layout for large networks
  - Statistical analysis (PageRank, betweenness centrality)
- Use: Import `graph.gexf`, run Modularity, apply ForceAtlas2

**VOSviewer** (vosviewer.com)
- Best for: Bibliometric-style cluster visualization
- Features:
  - Automatic cluster coloring
  - Density visualization
  - Clean, publication-ready output

### For Large Graph Visualization (16k+ nodes)

**Cosmograph** (cosmograph.app)
- Best for: GPU-accelerated visualization of large networks
- Features:
  - Handles 100k+ nodes smoothly
  - WebGL-based, runs in browser
  - Real-time interaction
- Use: Upload `nodes.csv` and `links.csv` from exports/

**Graphistry** (graphistry.com)
- Best for: Visual investigation of graph patterns
- Features:
  - GPU-accelerated
  - Point-and-click filtering
  - Histogram analysis

### For Finding Highly Connected Nodes

**NetworkX + Jupyter** (Python)
```python
import networkx as nx
import pandas as pd

# Load edges
edges = pd.read_csv('edges.csv')
G = nx.from_pandas_edgelist(edges, 'source', 'target')

# Find highly connected nodes
degree = dict(G.degree())
top_nodes = sorted(degree.items(), key=lambda x: -x[1])[:50]

# PageRank for influence
pagerank = nx.pagerank(G)
top_influential = sorted(pagerank.items(), key=lambda x: -x[1])[:50]
```

### For Exploring Connections

**Neo4j Browser** (neo4j.com)
- Best for: Interactive graph exploration
- Features:
  - Cypher queries for pattern matching
  - Visual path exploration
  - Property filtering
- Use: Import CSV data, write Cypher queries

**Linkurious** / **yEd Live**
- Best for: Manual exploration with search
- Features:
  - Search for specific nodes
  - Expand neighborhoods interactively

### For Activity Analysis

Since blog activity (post count, last post date) was partially collected:

1. **Time-series in Python/R** - Plot posting frequency over time
2. **Network + Activity overlay** - Size nodes by post count in Gephi
3. **Correlation analysis** - Do highly connected blogs post more?

## Scripts Reference

| Script | Purpose | Usage |
|--------|---------|-------|
| `scraper.py` | Original sequential scraper | `python scraper.py` |
| `fast_scraper.py` | Parallel scraper | `python fast_scraper.py --workers 20 --batch 200` |
| `scrape_circles.py` | Scrape API-based circles | `python scrape_circles.py` |
| `scrape_js_circles.py` | Scrape JS-rendered circles | `python scrape_js_circles.py` |
| `discover_friends.py` | Find friend links from scraped blogs | `python discover_friends.py --workers 20` |
| `deduplicate.py` | Remove duplicate entries | `python deduplicate.py` |
| `export_gexf.py` | Export to Gephi format | `python export_gexf.py` |
| `create_visualization.py` | Generate CSV and HTML viz | `python create_visualization.py` |

## Export Files

| File | Format | Purpose |
|------|--------|---------|
| `graph.gexf` | GEXF | Gephi import |
| `nodes.csv` | CSV | Cosmograph nodes |
| `links.csv` | CSV | Cosmograph edges |
| `network.html` | HTML | D3.js preview (top 500 nodes) |
| `detailed_summary.json` | JSON | Statistics and top blogs |

## Top 10 Most Connected Blogs

| Rank | Blog | Connections | SSG |
|------|------|-------------|-----|
| 1 | 张洪Heo (blog.zhheo.com) | 1,025 | Hexo |
| 2 | 开往 (travellings.cn) | 835 | VitePress |
| 3 | Hexo (hexo.io) | 672 | Hexo |
| 4 | 萌国ICP备案 (icp.gov.moe) | 645 | Unknown |
| 5 | LiuShen's Blog (blog.liushen.fun) | 620 | Hexo |
| 6 | Just (nav.natro92.fun) | 563 | VuePress |
| 7 | O3noBLOG (blog.othree.net) | 496 | Unknown |
| 8 | Fediring.net | 434 | Unknown |
| 9 | 月光下的过客 (panjinye.com) | 298 | Halo |
| 10 | 菲克力克 (ficor.net) | 295 | WordPress |

## Future Improvements

1. **Headless browser scraping** - Use Playwright for JS-rendered pages
2. **More SSG patterns** - Reduce "unknown" from 40%
3. **Activity tracking** - Periodic re-scraping for post counts
4. **Encoding fixes** - Better charset detection for blog names
5. **API discovery** - Find more circle APIs for complete member lists
