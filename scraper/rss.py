"""RSS feed discovery and parsing."""

from typing import Optional
import feedparser
import aiohttp

# RSS paths by SSG
RSS_PATHS = {
    "hexo": ["/atom.xml", "/rss.xml", "/rss2.xml", "/feed.xml"],
    "hugo": ["/index.xml", "/feed.xml", "/rss.xml"],
    "wordpress": ["/feed/", "/rss/", "/feed/rss2/", "/feed/atom/"],
    "typecho": ["/feed/", "/feed/atom/"],
    "jekyll": ["/feed.xml", "/atom.xml", "/rss.xml"],
    "ghost": ["/rss/", "/feed/"],
    "astro": ["/rss.xml", "/feed.xml", "/atom.xml"],
    "nextjs": ["/feed.xml", "/rss.xml", "/api/rss"],
    "11ty": ["/feed.xml", "/feed/feed.xml", "/rss.xml"],
    "vitepress": ["/feed.xml", "/rss.xml"],
    "gatsby": ["/rss.xml", "/feed.xml"],
}

# Default paths for unknown SSGs
DEFAULT_RSS_PATHS = [
    "/feed.xml",
    "/rss.xml",
    "/atom.xml",
    "/index.xml",
    "/feed/",
    "/rss/",
]


def get_rss_paths_for_ssg(ssg: str) -> list[str]:
    """Get RSS feed paths to try for a given SSG."""
    if ssg in RSS_PATHS:
        return RSS_PATHS[ssg]
    return DEFAULT_RSS_PATHS


def parse_rss_content(content: str) -> list[dict]:
    """Parse RSS/Atom feed content and extract articles."""
    feed = feedparser.parse(content)
    articles = []

    for entry in feed.entries:
        article = {
            "title": entry.get("title", ""),
            "url": entry.get("link", ""),
            "description": "",
            "cover_image": None,
            "published_at": None,
        }

        # Extract description
        if hasattr(entry, "summary"):
            article["description"] = entry.summary
        elif hasattr(entry, "description"):
            article["description"] = entry.description

        # Extract published date
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            from time import strftime

            article["published_at"] = strftime("%Y-%m-%d", entry.published_parsed)
        elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
            from time import strftime

            article["published_at"] = strftime("%Y-%m-%d", entry.updated_parsed)

        # Extract cover image from media:thumbnail
        if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
            article["cover_image"] = entry.media_thumbnail[0].get("url")

        # Extract cover image from enclosure (if image type)
        if not article["cover_image"] and hasattr(entry, "enclosures"):
            for enclosure in entry.enclosures:
                if enclosure.get("type", "").startswith("image/"):
                    article["cover_image"] = enclosure.get("url")
                    break

        # Extract cover image from content (first image)
        if not article["cover_image"] and hasattr(entry, "content"):
            import re

            for content_item in entry.content:
                img_match = re.search(
                    r'<img[^>]+src=["\']([^"\']+)["\']', content_item.get("value", "")
                )
                if img_match:
                    article["cover_image"] = img_match.group(1)
                    break

        articles.append(article)

    return articles


async def fetch_rss(
    blog_url: str, ssg: str = "unknown", timeout: int = 10
) -> list[dict]:
    """Fetch and parse RSS feed from a blog."""
    paths = get_rss_paths_for_ssg(ssg)

    async with aiohttp.ClientSession() as session:
        for path in paths:
            url = blog_url.rstrip("/") + path

            try:
                async with session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                    headers={
                        "User-Agent": "Mozilla/5.0 (compatible; IndieBlogReader/1.0)"
                    },
                ) as response:
                    if response.status == 200:
                        content = await response.text()
                        # Quick check if it looks like RSS/XML
                        if "<?xml" in content or "<rss" in content or "<feed" in content:
                            return parse_rss_content(content)
            except (aiohttp.ClientError, TimeoutError):
                continue

    return []


async def discover_rss_from_html(blog_url: str, html: str) -> Optional[str]:
    """Discover RSS feed URL from HTML link tags."""
    import re

    # Look for <link rel="alternate" type="application/rss+xml" href="...">
    pattern = r'<link[^>]+type=["\']application/(rss|atom)\+xml["\'][^>]+href=["\']([^"\']+)["\']'
    match = re.search(pattern, html, re.IGNORECASE)

    if match:
        href = match.group(2)
        # Handle relative URLs
        if href.startswith("/"):
            from urllib.parse import urlparse

            parsed = urlparse(blog_url)
            return f"{parsed.scheme}://{parsed.netloc}{href}"
        elif href.startswith("http"):
            return href

    return None
