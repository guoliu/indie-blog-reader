#!/usr/bin/env python3
"""Specialized scraper for blog circles/aggregators using their APIs."""

import sys
import json
import time
import requests
from pathlib import Path
from datetime import datetime
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent))
from utils import normalize_url, add_to_queue, save_circle, add_edge, log, get_base_url

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}


def scrape_travellings():
    """Scrape 开往 (Travellings) using their API."""
    log("Scraping 开往 (Travellings) via API...")

    try:
        response = requests.get('https://api.travellings.cn/all', headers=HEADERS, timeout=30)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        log(f"  Failed to fetch Travellings API: {e}")
        return []

    members = []
    # API returns {"success": true, "total": N, "data": [...]}
    if isinstance(data, dict) and 'data' in data:
        data = data['data']

    if isinstance(data, list):
        for item in data:
            url = item.get('url', '')
            status = item.get('status', '')
            # Only include running blogs
            if url and status in ('RUN', 'WAIT', ''):
                # Get base URL (homepage)
                base = get_base_url(url)
                if base:
                    members.append(base)

    log(f"  Found {len(members)} blogs from Travellings")

    # Save circle info
    circle = {
        'name': '开往',
        'url': 'https://www.travellings.cn/',
        'member_count': len(members),
        'members': members,
        'scraped_at': datetime.now().isoformat(),
    }
    save_circle(circle)

    # Add edges
    for member in members:
        add_edge(member, 'https://www.travellings.cn/', 'circle_member')

    return members


def scrape_foreverblog():
    """Scrape 十年之约 (Foreverblog) by crawling the member page."""
    log("Scraping 十年之约 (Foreverblog) by parsing member page...")

    members = []

    try:
        # Try multiple API endpoints
        urls_to_try = [
            'https://www.foreverblog.cn/api/v1/blogs',
            'https://www.foreverblog.cn/public/blogs.json',
        ]

        for api_url in urls_to_try:
            try:
                response = requests.get(api_url, headers=HEADERS, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    if isinstance(data, list):
                        for item in data:
                            url = item.get('url') or item.get('link') or item.get('blog_url')
                            if url:
                                members.append(get_base_url(url))
                        break
            except:
                continue

        # If no API works, scrape the main blogs page HTML
        if not members:
            response = requests.get('https://www.foreverblog.cn/blogs.html', headers=HEADERS, timeout=30)
            response.raise_for_status()
            html = response.text

            # Extract links that look like blog URLs
            import re
            # Look for href with external URLs (not foreverblog.cn itself)
            links = re.findall(r'href=["\']([^"\']+)["\']', html)
            for link in links:
                if link.startswith('http') and 'foreverblog.cn' not in link:
                    parsed = urlparse(link)
                    if parsed.netloc and '.' in parsed.netloc:
                        base = get_base_url(link)
                        if base not in members:
                            members.append(base)

            # Also look for data attributes that might contain URLs
            data_urls = re.findall(r'data-(?:url|link|href)=["\']([^"\']+)["\']', html)
            for url in data_urls:
                if url.startswith('http'):
                    base = get_base_url(url)
                    if base not in members:
                        members.append(base)

    except Exception as e:
        log(f"  Failed to fetch Foreverblog: {e}")

    log(f"  Found {len(members)} blogs from 十年之约")

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


def scrape_blogscn():
    """Scrape 笔墨迹 (BlogsCN) by trying various approaches."""
    log("Scraping 笔墨迹 (BlogsCN)...")

    members = []

    try:
        # Try to find their API or data source
        # First check if there's a GitHub repo or public data
        possible_endpoints = [
            'https://blogscn.fun/blogs/api/list',
            'https://blogscn.fun/api/blogs',
            'https://blogscn.fun/data/blogs.json',
        ]

        for endpoint in possible_endpoints:
            try:
                response = requests.get(endpoint, headers=HEADERS, timeout=10)
                if response.status_code == 200:
                    try:
                        data = response.json()
                        if isinstance(data, dict) and 'data' in data:
                            data = data['data']
                        if isinstance(data, list):
                            for item in data:
                                url = item.get('url') or item.get('link')
                                if url:
                                    members.append(get_base_url(url))
                            break
                    except:
                        pass
            except:
                continue

        # Try the random endpoint multiple times to collect blogs
        if not members:
            seen = set()
            for _ in range(50):  # Try 50 times to get random blogs
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
                            if link and link not in seen:
                                seen.add(link)
                                members.append(get_base_url(link))
                    time.sleep(0.2)
                except:
                    continue

    except Exception as e:
        log(f"  Failed to fetch BlogsCN: {e}")

    log(f"  Found {len(members)} blogs from 笔墨迹")

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


def scrape_blogsclub():
    """Scrape BlogsClub."""
    log("Scraping BlogsClub...")

    members = []

    try:
        # Try the members page directly
        response = requests.get('https://www.blogsclub.org/members.html', headers=HEADERS, timeout=30)
        response.raise_for_status()
        html = response.text

        import re
        # Look for homepage links in the data
        # The API returns 'homepage' field for each member
        # Try to extract from JS data or HTML attributes

        # Look for data-homepage or similar attributes
        homepages = re.findall(r'(?:homepage|blog_url|data-url)["\']?\s*[:=]\s*["\']([^"\']+)["\']', html)
        for url in homepages:
            if url.startswith('http') and 'blogsclub.org' not in url:
                base = get_base_url(url)
                if base not in members:
                    members.append(base)

        # Also look for external links in general
        links = re.findall(r'href=["\']([^"\']+)["\']', html)
        for link in links:
            if link.startswith('http') and 'blogsclub.org' not in link:
                parsed = urlparse(link)
                if parsed.netloc and '.' in parsed.netloc:
                    # Filter out common non-blog domains
                    skip = ['github.com', 'twitter.com', 'weibo.com', 'qq.com', 'google.com']
                    if not any(d in parsed.netloc for d in skip):
                        base = get_base_url(link)
                        if base not in members:
                            members.append(base)

    except Exception as e:
        log(f"  Failed to fetch BlogsClub: {e}")

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
    all_members.extend(scrape_travellings())
    time.sleep(1)

    all_members.extend(scrape_foreverblog())
    time.sleep(1)

    all_members.extend(scrape_blogscn())
    time.sleep(1)

    all_members.extend(scrape_blogsclub())

    # Dedupe and add to queue
    unique_members = list(set(all_members))
    added = add_to_queue(unique_members)

    log(f"\nTotal: Found {len(unique_members)} unique blogs from all circles")
    log(f"Added {len(added)} new URLs to queue")


if __name__ == '__main__':
    main()
