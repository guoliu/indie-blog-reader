#!/usr/bin/env python3
"""Discover friend links from already-scraped blogs to expand the network."""

import sys
import json
import time
import requests
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(Path(__file__).parent))

from utils import (
    normalize_url, get_base_url, get_domain, load_seen_urls, add_to_queue,
    add_edge, log, get_stats, is_likely_blog_url, DATA_DIR
)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}
TIMEOUT = 10


def fetch_url(url: str) -> str:
    """Fetch URL content."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
        response.raise_for_status()
        response.encoding = response.apparent_encoding or 'utf-8'
        return response.text
    except:
        return None


def find_friend_links_page(base_url: str) -> list:
    """Try common friend link page paths."""
    paths = [
        '/links', '/links/', '/link', '/link/',
        '/friends', '/friends/', '/friend', '/friend/',
        '/blogroll', '/blogroll/',
        '/links.html', '/friend.html', '/friends.html',
        '/about/links', '/page/links',
    ]

    # Also try Chinese paths
    paths.extend([
        '/友链', '/友链/',
        '/友情链接', '/友情链接/',
    ])

    possible_urls = []
    for path in paths:
        url = urljoin(base_url + '/', path.lstrip('/'))
        possible_urls.append(url)

    return possible_urls


def extract_external_links(html: str, base_url: str) -> list:
    """Extract external blog-like links from HTML."""
    if not html:
        return []

    links = []
    base_domain = get_domain(base_url)

    # Find all href links
    href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)

    for match in href_pattern.finditer(html):
        href = match.group(1)
        if href.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
            continue

        # Convert to absolute URL
        try:
            absolute_url = urljoin(base_url, href)
        except:
            continue

        # Check if it's external
        link_domain = get_domain(absolute_url)
        if link_domain and link_domain != base_domain:
            # Check if it looks like a blog
            if is_likely_blog_url(absolute_url):
                # Normalize to base URL (homepage)
                base = get_base_url(absolute_url)
                if base and base not in links:
                    links.append(base)

    return links


def discover_friends_for_blog(blog_url: str) -> list:
    """Discover friend links for a single blog."""
    blog_url = normalize_url(blog_url)
    base_url = get_base_url(blog_url)

    discovered = []

    # Try common friend link pages
    for url in find_friend_links_page(base_url):
        html = fetch_url(url)
        if html:
            # Check if it looks like a friend links page
            if any(keyword in html.lower() for keyword in ['friend', '友链', '友情', 'blogroll', 'link']):
                links = extract_external_links(html, url)
                if links:
                    discovered.extend(links)
                    # Add edges
                    for link in links:
                        add_edge(blog_url, link, 'friend_link')
                    break  # Found friend page, stop trying

    return list(set(discovered))


def discover_all_friends(workers: int = 20):
    """Discover friend links from all scraped blogs."""
    blogs_file = DATA_DIR / "blogs.jsonl"

    if not blogs_file.exists():
        log("No blogs file found!")
        return

    # Load all blog URLs
    blog_urls = []
    with open(blogs_file, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                try:
                    blog = json.loads(line)
                    url = blog.get('url', '')
                    if url:
                        blog_urls.append(url)
                except:
                    continue

    log(f"Discovering friend links from {len(blog_urls)} blogs with {workers} workers...")

    seen = load_seen_urls()
    all_discovered = []
    processed = 0

    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_to_url = {executor.submit(discover_friends_for_blog, url): url for url in blog_urls}

        for future in as_completed(future_to_url):
            url = future_to_url[future]
            processed += 1

            try:
                friends = future.result()
                for friend in friends:
                    if normalize_url(friend) not in seen:
                        all_discovered.append(friend)
            except Exception as e:
                pass

            if processed % 100 == 0:
                log(f"  Processed {processed}/{len(blog_urls)} blogs, found {len(all_discovered)} new links...")

    # Dedupe and add to queue
    unique = list(set(all_discovered))
    added = add_to_queue(unique)
    log(f"Discovery complete. Found {len(unique)} unique new blogs, added {len(added)} to queue.")

    stats = get_stats()
    log(f"Current stats: {stats['blogs']} blogs, {stats['queue']} in queue")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Discover friend links')
    parser.add_argument('--workers', type=int, default=20, help='Parallel workers')
    args = parser.parse_args()

    discover_all_friends(workers=args.workers)
