#!/usr/bin/env python3
"""Scrape circles that need special handling (API or page parsing)."""

import sys
import json
import time
import re
import requests
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent))
from utils import normalize_url, add_to_queue, save_circle, add_edge, log, get_base_url, is_likely_blog_url

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}


def scrape_blogscn():
    """Scrape 笔墨迹 using random API (no full list available)."""
    log("Scraping 笔墨迹 (BlogsCN) via random API...")

    members = set()
    max_attempts = 500  # Try 500 times to collect as many as possible

    for i in range(max_attempts):
        try:
            response = requests.post(
                'https://blogscn.fun/blogs/api/RandomBlogInfo',
                headers=HEADERS,
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()
                if data.get('code') == 200 and 'data' in data:
                    link = data['data'].get('link')
                    if link and is_likely_blog_url(link):
                        base = get_base_url(link)
                        if base:
                            members.add(base)
            if (i + 1) % 100 == 0:
                log(f"  Progress: {i+1}/{max_attempts} attempts, {len(members)} unique blogs found")
            time.sleep(0.1)  # Be polite
        except Exception as e:
            continue

    members = list(members)
    log(f"  Found {len(members)} unique blogs from 笔墨迹")

    if members:
        circle = {
            'name': '笔墨迹',
            'url': 'https://blogscn.fun/',
            'member_count': len(members),
            'members': members,
            'scraped_at': datetime.now().isoformat(),
        }
        save_circle(circle)

        for member in members:
            add_edge(member, 'https://blogscn.fun/', 'circle_member')

    return members


def scrape_foreverblog():
    """Scrape 十年之约 by parsing blog pages."""
    log("Scraping 十年之约 (Foreverblog) via page parsing...")

    # First get all blog IDs from the main page
    try:
        response = requests.get('https://www.foreverblog.cn/blogs.html', headers=HEADERS, timeout=30)
        response.raise_for_status()
        html = response.text
    except Exception as e:
        log(f"  Failed to fetch main page: {e}")
        return []

    # Extract blog IDs (format: /blog/XXX.html)
    blog_ids = re.findall(r'/blog/([^"]+)\.html', html)
    blog_ids = list(set(blog_ids))
    log(f"  Found {len(blog_ids)} blog entries to process")

    members = set()

    # Fetch each blog page to get actual URLs
    for i, blog_id in enumerate(blog_ids):
        try:
            url = f"https://www.foreverblog.cn/blog/{blog_id}.html"
            response = requests.get(url, headers=HEADERS, timeout=10)
            if response.status_code == 200:
                # Extract external URLs from the page
                urls = re.findall(r'https?://[a-zA-Z0-9.-]+\.[a-z]{2,}[^"<>\s]*', response.text)
                for u in urls:
                    # Filter to likely blog URLs
                    if is_likely_blog_url(u) and 'foreverblog' not in u:
                        base = get_base_url(u)
                        if base:
                            members.add(base)

            if (i + 1) % 100 == 0:
                log(f"  Progress: {i+1}/{len(blog_ids)} pages, {len(members)} unique blogs found")

            time.sleep(0.05)  # Be polite
        except Exception as e:
            continue

    members = list(members)
    log(f"  Found {len(members)} unique blogs from 十年之约")

    if members:
        circle = {
            'name': '十年之约',
            'url': 'https://www.foreverblog.cn/',
            'member_count': len(members),
            'members': members,
            'scraped_at': datetime.now().isoformat(),
        }
        save_circle(circle)

        for member in members:
            add_edge(member, 'https://www.foreverblog.cn/', 'circle_member')

    return members


def scrape_blogsclub():
    """Scrape BlogsClub."""
    log("Scraping BlogsClub...")

    members = set()

    try:
        # Try the main page
        response = requests.get('https://www.blogsclub.org/members.html', headers=HEADERS, timeout=30)
        response.raise_for_status()
        html = response.text

        # Look for external blog URLs
        urls = re.findall(r'https?://[a-zA-Z0-9.-]+\.[a-z]{2,}[^"<>\s]*', html)
        for u in urls:
            if is_likely_blog_url(u) and 'blogsclub' not in u:
                base = get_base_url(u)
                if base:
                    members.add(base)

        # Also try to find any data attributes or JS variables
        data_urls = re.findall(r'(?:homepage|blog_url|url)["\']?\s*[:=]\s*["\']([^"\']+)["\']', html)
        for u in data_urls:
            if u.startswith('http') and is_likely_blog_url(u):
                base = get_base_url(u)
                if base:
                    members.add(base)

    except Exception as e:
        log(f"  Failed to fetch BlogsClub: {e}")

    members = list(members)
    log(f"  Found {len(members)} blogs from BlogsClub")

    if members:
        circle = {
            'name': 'BlogsClub',
            'url': 'https://www.blogsclub.org/',
            'member_count': len(members),
            'members': members,
            'scraped_at': datetime.now().isoformat(),
        }
        save_circle(circle)

        for member in members:
            add_edge(member, 'https://www.blogsclub.org/', 'circle_member')

    return members


def main():
    """Scrape all circles and add members to queue."""
    all_members = []

    # Scrape each circle
    all_members.extend(scrape_foreverblog())
    time.sleep(1)

    all_members.extend(scrape_blogscn())
    time.sleep(1)

    all_members.extend(scrape_blogsclub())

    # Dedupe and add to queue
    unique_members = list(set(all_members))
    added = add_to_queue(unique_members)

    log(f"\nTotal: Found {len(unique_members)} unique blogs from JS circles")
    log(f"Added {len(added)} new URLs to queue")


if __name__ == '__main__':
    main()
