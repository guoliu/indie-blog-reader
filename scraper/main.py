#!/usr/bin/env python3
"""Main CLI for the Indie Blog Reader scraper."""

import asyncio
import argparse
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from db import (
    get_blogs_to_scrape,
    save_articles,
    update_blog_rss_url,
    update_blog_scraped_at,
    get_blog_count,
    get_article_count,
)
from rss import fetch_rss, get_rss_paths_for_ssg


async def scrape_blog(blog: dict) -> dict:
    """Scrape a single blog for new articles."""
    blog_id = blog["id"]
    url = blog["url"]
    ssg = blog.get("ssg") or "unknown"
    rss_url = blog.get("rss_url")

    result = {
        "blog_id": blog_id,
        "url": url,
        "articles_found": 0,
        "new_articles": 0,
        "error": None,
    }

    try:
        # Try to fetch RSS
        articles = await fetch_rss(url, ssg)

        if articles:
            result["articles_found"] = len(articles)
            new_count = save_articles(blog_id, articles)
            result["new_articles"] = new_count

        update_blog_scraped_at(blog_id)

    except Exception as e:
        result["error"] = str(e)

    return result


async def refresh(limit: int = 100) -> dict:
    """Refresh articles from blogs."""
    blogs = get_blogs_to_scrape(limit=limit)

    print(f"Scraping {len(blogs)} blogs...")

    results = {
        "blogs_scraped": 0,
        "articles_found": 0,
        "new_articles": 0,
        "errors": 0,
    }

    # Process blogs in batches to avoid overwhelming the network
    batch_size = 10

    for i in range(0, len(blogs), batch_size):
        batch = blogs[i : i + batch_size]

        # Scrape batch concurrently
        tasks = [scrape_blog(blog) for blog in batch]
        batch_results = await asyncio.gather(*tasks)

        for r in batch_results:
            results["blogs_scraped"] += 1
            results["articles_found"] += r["articles_found"]
            results["new_articles"] += r["new_articles"]
            if r["error"]:
                results["errors"] += 1

        # Progress update
        print(
            f"  Progress: {results['blogs_scraped']}/{len(blogs)} blogs, "
            f"{results['new_articles']} new articles"
        )

    return results


def main():
    parser = argparse.ArgumentParser(description="Indie Blog Reader Scraper")
    parser.add_argument(
        "command",
        choices=["refresh", "stats"],
        help="Command to run",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Maximum number of blogs to scrape (default: 100)",
    )

    args = parser.parse_args()

    if args.command == "refresh":
        results = asyncio.run(refresh(limit=args.limit))
        print("\nRefresh complete!")
        print(f"  Blogs scraped: {results['blogs_scraped']}")
        print(f"  Articles found: {results['articles_found']}")
        print(f"  New articles: {results['new_articles']}")
        print(f"  Errors: {results['errors']}")

    elif args.command == "stats":
        print(f"Total blogs: {get_blog_count()}")
        print(f"Total articles: {get_article_count()}")


if __name__ == "__main__":
    main()
