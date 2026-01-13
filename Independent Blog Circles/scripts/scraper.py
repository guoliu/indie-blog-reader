#!/usr/bin/env python3
"""Main scraper for Chinese independent blogs."""

import sys
import json
import time
import argparse
import requests
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from utils import (
    normalize_url, get_domain, get_base_url, load_seen_urls, load_queue,
    save_queue, add_to_queue, save_blog, save_circle, add_edge, save_failed,
    log, get_stats, is_likely_blog_url
)
from detectors import (
    detect_ssg, detect_theme, detect_comment_system, count_articles,
    extract_blog_name, find_friend_links_page, extract_friend_links
)

# Request settings
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}
TIMEOUT = 15
MAX_RETRIES = 2


def fetch_url(url: str) -> tuple:
    """Fetch URL content. Returns (html, headers, error)."""
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
            response.raise_for_status()

            # Try to detect encoding
            response.encoding = response.apparent_encoding or 'utf-8'

            return response.text, dict(response.headers), None
        except requests.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                time.sleep(1)
                continue
            return None, None, str(e)

    return None, None, "Max retries exceeded"


def scrape_blog(url: str) -> dict:
    """Scrape a single blog and extract all information."""
    url = normalize_url(url)
    log(f"Scraping: {url}")

    result = {
        'url': url,
        'name': None,
        'ssg': 'unknown',
        'theme': None,
        'comment_system': {'type': 'none', 'storage': None, 'identity': None},
        'activity': {'article_count': None, 'comment_count': None, 'last_post_date': None},
        'friend_links': [],
        'circles': [],
        'scraped_at': datetime.now().isoformat(),
        'scrape_status': 'complete',
    }

    # Fetch main page
    html, headers, error = fetch_url(url)
    if error:
        log(f"  Failed to fetch: {error}")
        result['scrape_status'] = 'failed'
        save_failed(url, error)
        return result

    # Extract basic info
    result['name'] = extract_blog_name(html, url)
    result['ssg'] = detect_ssg(html, headers)
    result['theme'] = detect_theme(html, result['ssg'])
    result['comment_system'] = detect_comment_system(html)

    log(f"  Name: {result['name']}, SSG: {result['ssg']}, Comments: {result['comment_system']['type']}")

    # Try to find and fetch friend links page
    base_url = get_base_url(url)
    friend_page_url = find_friend_links_page(html, base_url)

    friend_links = []
    if friend_page_url:
        log(f"  Found friend links page: {friend_page_url}")
        friend_html, _, friend_error = fetch_url(friend_page_url)
        if friend_html:
            friend_links = extract_friend_links(friend_html, friend_page_url)
    else:
        # Try common friend link paths
        common_paths = ['/links', '/links/', '/friend', '/friends', '/友链', '/link', '/blogroll']
        for path in common_paths:
            try_url = urljoin(base_url, path)
            friend_html, _, _ = fetch_url(try_url)
            if friend_html and ('friend' in friend_html.lower() or '友链' in friend_html or '友情' in friend_html):
                friend_links = extract_friend_links(friend_html, try_url)
                if friend_links:
                    log(f"  Found friend links at: {try_url}")
                    break

    result['friend_links'] = friend_links
    log(f"  Found {len(friend_links)} friend links")

    # Try to count articles (check archive page)
    archive_paths = ['/archives', '/archive', '/posts', '/blog', '/articles']
    for path in archive_paths:
        archive_url = urljoin(base_url, path)
        archive_html, _, _ = fetch_url(archive_url)
        if archive_html:
            article_count = count_articles(archive_html, archive_url)
            if article_count:
                result['activity']['article_count'] = article_count
                log(f"  Article count: {article_count}")
                break

    # If no archive found, try counting from main page
    if not result['activity']['article_count']:
        article_count = count_articles(html, url)
        if article_count:
            result['activity']['article_count'] = article_count

    return result


def scrape_circle(circle_url: str, circle_name: str) -> dict:
    """Scrape a blog circle/aggregator to get member blogs."""
    log(f"Scraping circle: {circle_name} ({circle_url})")

    result = {
        'name': circle_name,
        'url': circle_url,
        'member_count': 0,
        'members': [],
        'scraped_at': datetime.now().isoformat(),
    }

    html, _, error = fetch_url(circle_url)
    if error:
        log(f"  Failed to fetch circle: {error}")
        return result

    # Extract all links that look like blog URLs
    from utils import extract_links_from_html

    all_links = extract_links_from_html(html, circle_url)

    members = []
    for link in all_links:
        if is_likely_blog_url(link):
            # Make sure it's not the circle's own domain
            circle_domain = get_domain(circle_url)
            link_domain = get_domain(link)
            if circle_domain != link_domain:
                normalized = normalize_url(link)
                # Get just the base URL (homepage)
                base = get_base_url(normalized)
                if base not in members:
                    members.append(base)

    result['members'] = members
    result['member_count'] = len(members)
    log(f"  Found {len(members)} member blogs")

    return result


def run_batch(batch_size: int = 50):
    """Run a batch of blog scraping."""
    stats = get_stats()
    log(f"Starting batch. Current stats: {stats['blogs']} blogs, {stats['queue']} in queue")

    queue = load_queue()
    if not queue:
        log("Queue is empty!")
        return

    # Take batch from queue
    batch = queue[:batch_size]
    remaining = queue[batch_size:]
    save_queue(remaining)

    log(f"Processing {len(batch)} URLs...")

    seen = load_seen_urls()
    new_links = []

    for url in batch:
        if normalize_url(url) in seen:
            continue

        blog = scrape_blog(url)
        save_blog(blog)
        seen.add(normalize_url(url))

        # Add friend links as edges and to queue
        for friend_url in blog['friend_links']:
            add_edge(url, friend_url, 'friend_link')
            if normalize_url(friend_url) not in seen:
                new_links.append(friend_url)

        # Be polite - don't hammer servers
        time.sleep(0.5)

    # Add new links to queue
    added = add_to_queue(new_links)
    log(f"Added {len(added)} new URLs to queue")

    stats = get_stats()
    log(f"Batch complete. Stats: {stats['blogs']} blogs, {stats['queue']} in queue")


def scrape_circles_from_seed():
    """Scrape the known blog circles to bootstrap the queue."""
    circles = [
        ('开往', 'https://www.travellings.cn/'),
        ('笔墨迹', 'https://blogscn.fun/blogs.html'),
        ('BlogsClub', 'https://www.blogsclub.org/members.html'),
        ('十年之约', 'https://www.foreverblog.cn/blogs.html'),
    ]

    all_members = []

    for name, url in circles:
        circle = scrape_circle(url, name)
        save_circle(circle)

        # Add edges for circle membership
        for member in circle['members']:
            add_edge(member, url, 'circle_member')
            all_members.append(member)

        time.sleep(1)

    # Add all members to queue
    added = add_to_queue(all_members)
    log(f"Added {len(added)} blogs from circles to queue")


def seed_from_file():
    """Seed queue from the starting URLs in 中文.md."""
    seed_file = Path(__file__).parent.parent / "中文.md"

    if not seed_file.exists():
        log("Seed file not found!")
        return

    with open(seed_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract URLs
    import re
    urls = re.findall(r'https?://[^\s\)]+', content)

    # Filter to just blog URLs (not circle URLs)
    blog_urls = [url for url in urls if is_likely_blog_url(url)]

    added = add_to_queue(blog_urls)
    log(f"Added {len(added)} seed URLs to queue")


def main():
    parser = argparse.ArgumentParser(description='Chinese blog scraper')
    parser.add_argument('command', choices=['seed', 'circles', 'batch', 'stats'],
                       help='Command to run')
    parser.add_argument('--batch-size', type=int, default=50,
                       help='Number of blogs to scrape per batch')

    args = parser.parse_args()

    if args.command == 'seed':
        seed_from_file()
    elif args.command == 'circles':
        scrape_circles_from_seed()
    elif args.command == 'batch':
        run_batch(args.batch_size)
    elif args.command == 'stats':
        stats = get_stats()
        print(f"Blogs scraped: {stats['blogs']}")
        print(f"Circles scraped: {stats['circles']}")
        print(f"URLs in queue: {stats['queue']}")


if __name__ == '__main__':
    main()
