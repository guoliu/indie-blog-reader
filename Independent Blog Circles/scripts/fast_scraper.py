#!/usr/bin/env python3
"""Fast parallel scraper for Chinese independent blogs - basic info only."""

import sys
import json
import time
import argparse
import requests
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).parent))

from utils import (
    normalize_url, get_base_url, load_seen_urls, load_queue,
    save_queue, save_blog, save_failed, log, get_stats
)
from detectors import (
    detect_ssg, detect_theme, detect_comment_system,
    extract_blog_name
)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}
TIMEOUT = 10  # Shorter timeout for speed


def fetch_url(url: str) -> tuple:
    """Fetch URL content. Returns (html, headers, error)."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or 'utf-8'
        return response.text, dict(response.headers), None
    except requests.RequestException as e:
        return None, None, str(e)


def scrape_blog_fast(url: str) -> dict:
    """Scrape basic blog info only - no friend links, no archive checking."""
    url = normalize_url(url)

    result = {
        'url': url,
        'name': None,
        'ssg': 'unknown',
        'theme': None,
        'comment_system': {'type': 'none', 'storage': None, 'identity': None},
        'activity': {'article_count': None, 'comment_count': None, 'last_post_date': None},
        'friend_links': [],  # Will be filled in second pass
        'circles': [],
        'scraped_at': datetime.now().isoformat(),
        'scrape_status': 'complete',
    }

    html, headers, error = fetch_url(url)
    if error:
        result['scrape_status'] = 'failed'
        result['error'] = error
        return result

    # Extract basic info only
    result['name'] = extract_blog_name(html, url)
    result['ssg'] = detect_ssg(html, headers)
    result['theme'] = detect_theme(html, result['ssg'])
    result['comment_system'] = detect_comment_system(html)

    return result


def run_batch_parallel(batch_size: int = 200, workers: int = 20):
    """Run a batch with parallel requests."""
    stats = get_stats()
    log(f"Starting parallel batch. Stats: {stats['blogs']} blogs, {stats['queue']} in queue")

    queue = load_queue()
    if not queue:
        log("Queue is empty!")
        return

    # Take batch from queue
    batch = queue[:batch_size]
    remaining = queue[batch_size:]
    save_queue(remaining)

    log(f"Processing {len(batch)} URLs with {workers} workers...")

    seen = load_seen_urls()
    results = []
    failed_count = 0
    success_count = 0

    # Filter out already seen URLs
    batch = [url for url in batch if normalize_url(url) not in seen]

    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_url = {executor.submit(scrape_blog_fast, url): url for url in batch}

        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                blog = future.result()
                if blog['scrape_status'] == 'complete':
                    save_blog(blog)
                    success_count += 1
                    if success_count % 50 == 0:
                        log(f"  Progress: {success_count} scraped...")
                else:
                    save_failed(url, blog.get('error', 'unknown'))
                    failed_count += 1
            except Exception as e:
                save_failed(url, str(e))
                failed_count += 1

    stats = get_stats()
    log(f"Batch complete. Success: {success_count}, Failed: {failed_count}")
    log(f"Total stats: {stats['blogs']} blogs, {stats['queue']} in queue")


def run_continuous(target: int = 1000, batch_size: int = 200, workers: int = 20):
    """Run continuously until target is reached or queue is empty."""
    log(f"Starting continuous scraping. Target: {target} blogs")

    while True:
        stats = get_stats()
        if stats['blogs'] >= target:
            log(f"Target reached! {stats['blogs']} blogs scraped.")
            break

        if stats['queue'] == 0:
            log("Queue is empty!")
            break

        run_batch_parallel(batch_size=batch_size, workers=workers)

        # Small delay between batches
        time.sleep(1)

    stats = get_stats()
    log(f"Final stats: {stats['blogs']} blogs, {stats['circles']} circles")


def main():
    parser = argparse.ArgumentParser(description='Fast parallel blog scraper')
    parser.add_argument('command', choices=['batch', 'continuous', 'stats'],
                       help='Command to run')
    parser.add_argument('--batch-size', type=int, default=200,
                       help='URLs per batch')
    parser.add_argument('--workers', type=int, default=20,
                       help='Parallel workers')
    parser.add_argument('--target', type=int, default=1000,
                       help='Target blog count for continuous mode')

    args = parser.parse_args()

    if args.command == 'batch':
        run_batch_parallel(batch_size=args.batch_size, workers=args.workers)
    elif args.command == 'continuous':
        run_continuous(target=args.target, batch_size=args.batch_size, workers=args.workers)
    elif args.command == 'stats':
        stats = get_stats()
        print(f"Blogs scraped: {stats['blogs']}")
        print(f"Circles scraped: {stats['circles']}")
        print(f"URLs in queue: {stats['queue']}")


if __name__ == '__main__':
    main()
