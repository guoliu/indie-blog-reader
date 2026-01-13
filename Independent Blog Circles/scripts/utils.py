"""Utility functions for blog scraping."""

import json
import csv
import os
import re
from urllib.parse import urlparse, urljoin
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
LOGS_DIR = Path(__file__).parent.parent / "logs"

def normalize_url(url: str) -> str:
    """Normalize URL for deduplication."""
    if not url:
        return ""

    # Add scheme if missing
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    parsed = urlparse(url)

    # Normalize: lowercase host, remove www, remove trailing slash, remove fragments
    host = parsed.netloc.lower()
    if host.startswith('www.'):
        host = host[4:]

    path = parsed.path.rstrip('/')
    if not path:
        path = ''

    return f"{parsed.scheme}://{host}{path}"


def get_domain(url: str) -> str:
    """Extract domain from URL."""
    parsed = urlparse(normalize_url(url))
    return parsed.netloc


def get_base_url(url: str) -> str:
    """Get base URL (scheme + host) from URL."""
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def load_seen_urls() -> set:
    """Load already scraped URLs."""
    seen = set()
    blogs_file = DATA_DIR / "blogs.jsonl"
    if blogs_file.exists():
        with open(blogs_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    try:
                        blog = json.loads(line)
                        seen.add(normalize_url(blog.get('url', '')))
                    except json.JSONDecodeError:
                        continue
    return seen


def load_queue() -> list:
    """Load URLs from queue."""
    queue_file = DATA_DIR / "queue.txt"
    if not queue_file.exists():
        return []

    with open(queue_file, 'r', encoding='utf-8') as f:
        return [line.strip() for line in f if line.strip()]


def save_queue(urls: list):
    """Save URLs to queue."""
    queue_file = DATA_DIR / "queue.txt"
    with open(queue_file, 'w', encoding='utf-8') as f:
        for url in urls:
            f.write(url + '\n')


def add_to_queue(urls: list):
    """Add new URLs to queue (deduped)."""
    seen = load_seen_urls()
    current_queue = set(load_queue())

    new_urls = []
    for url in urls:
        normalized = normalize_url(url)
        if normalized and normalized not in seen and normalized not in current_queue:
            new_urls.append(normalized)
            current_queue.add(normalized)

    if new_urls:
        queue_file = DATA_DIR / "queue.txt"
        with open(queue_file, 'a', encoding='utf-8') as f:
            for url in new_urls:
                f.write(url + '\n')

    return new_urls


def save_blog(blog: dict):
    """Append blog to blogs.jsonl."""
    blogs_file = DATA_DIR / "blogs.jsonl"
    with open(blogs_file, 'a', encoding='utf-8') as f:
        f.write(json.dumps(blog, ensure_ascii=False) + '\n')


def save_circle(circle: dict):
    """Append circle to circles.jsonl."""
    circles_file = DATA_DIR / "circles.jsonl"
    with open(circles_file, 'a', encoding='utf-8') as f:
        f.write(json.dumps(circle, ensure_ascii=False) + '\n')


def add_edge(source: str, target: str, edge_type: str):
    """Add edge to edges.csv."""
    edges_file = DATA_DIR / "edges.csv"

    # Create with header if doesn't exist
    if not edges_file.exists():
        with open(edges_file, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['source', 'target', 'type'])

    with open(edges_file, 'a', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([normalize_url(source), normalize_url(target), edge_type])


def save_failed(url: str, reason: str):
    """Log failed URL."""
    failed_file = DATA_DIR / "failed.txt"
    with open(failed_file, 'a', encoding='utf-8') as f:
        f.write(f"{url}\t{reason}\n")


def log(message: str):
    """Log message with timestamp."""
    timestamp = datetime.now().isoformat()
    log_line = f"[{timestamp}] {message}"
    print(log_line)

    log_file = LOGS_DIR / "scrape.log"
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(log_line + '\n')


def get_stats() -> dict:
    """Get current scraping stats."""
    blogs_file = DATA_DIR / "blogs.jsonl"
    circles_file = DATA_DIR / "circles.jsonl"
    queue_file = DATA_DIR / "queue.txt"

    blog_count = 0
    if blogs_file.exists():
        with open(blogs_file, 'r', encoding='utf-8') as f:
            blog_count = sum(1 for line in f if line.strip())

    circle_count = 0
    if circles_file.exists():
        with open(circles_file, 'r', encoding='utf-8') as f:
            circle_count = sum(1 for line in f if line.strip())

    queue_count = len(load_queue())

    return {
        'blogs': blog_count,
        'circles': circle_count,
        'queue': queue_count
    }


def extract_links_from_html(html: str, base_url: str) -> list:
    """Extract all href links from HTML."""
    links = []
    # Simple regex to find href attributes
    href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)

    for match in href_pattern.finditer(html):
        href = match.group(1)
        if href.startswith(('#', 'javascript:', 'mailto:', 'tel:')):
            continue

        # Convert relative to absolute
        absolute_url = urljoin(base_url, href)
        links.append(absolute_url)

    return links


def is_likely_blog_url(url: str) -> bool:
    """Check if URL is likely a blog (not social media, not assets, not services)."""
    if not url:
        return False

    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()

    # Skip social media and big platforms
    skip_domains = [
        # Social media
        'github.com', 'twitter.com', 'x.com', 'weibo.com', 'zhihu.com',
        'bilibili.com', 'youtube.com', 'facebook.com', 'instagram.com',
        'telegram.org', 't.me', 'discord.com', 'discord.gg', 'linkedin.com',
        'reddit.com', 'pinterest.com', 'tiktok.com', 'douyin.com',
        'xiaohongshu.com', 'douban.com', 'tieba.baidu.com',
        # Search engines
        'google.com', 'baidu.com', 'bing.com', 'sogou.com', 'so.com',
        # CDNs and static assets
        'jsdelivr.net', 'cloudflare.com', 'unpkg.com', 'cdnjs.com',
        'bootcdn.cn', 'bootcss.com', 'staticfile.org', 'cloudflareinsights.com',
        'cdn.bootcdn.net', 'loli.net', 'fonts.googleapis.com', 'fonts.gstatic.com',
        # Avatar and image services
        'gravatar.com', 'wp.com', 'githubusercontent.com', 'cravatar.cn',
        'weavatar.com', 'q.qlogo.cn', 'thirdqq.qlogo.cn',
        # Payment and donation
        'afdian.com', 'afdian.net', 'paypal.com', 'ko-fi.com', 'patreon.com',
        # Government and ICP
        'beian.miit.gov.cn', 'icp.gov.cn', 'mps.gov.cn',
        # Cloud and hosting services (not personal blogs)
        'vercel.app', 'netlify.app', 'herokuapp.com', 'railway.app',  # These can be blogs
        'amazonaws.com', 'aliyuncs.com', 'qcloud.com', 'tencentcloud.com',
        'azure.com', 'cloudfront.net', 'akamai.com',
        # Analytics and tracking
        'google-analytics.com', 'googletagmanager.com', 'umami.is',
        'plausible.io', 'clarity.ms', 'hotjar.com', 'cnzz.com', 'busuanzi.ibruce.info',
        # Survey and form services
        'wjx.cn', 'wenjuan.com', 'typeform.com', 'jotform.com',
        # Code and docs platforms (not personal blogs)
        'gitee.com', 'gitlab.com', 'bitbucket.org', 'codepen.io', 'jsfiddle.net',
        'stackoverflow.com', 'stackexchange.com', 'csdn.net', 'jianshu.com',
        # Comment systems
        'giscus.app', 'utteranc.es', 'disqus.com', 'disquscdn.com',
        # Miscellaneous services
        'geetest.com', 'recaptcha.net', 'hcaptcha.com',
        'browsehappy.com', 'creativecommons.org', 'opensource.org',
        'status.', 'uptime.',  # Status pages
        'dogecloud.com', 'qiniu.com', 'upyun.com',  # Chinese CDNs
        'apple.com', 'microsoft.com', 'mozilla.org',
    ]

    for domain in skip_domains:
        if domain in host:
            return False

    # Skip if it's just a subdomain of a common service
    skip_exact = ['blogs.forum']  # Common false positives
    if host in skip_exact:
        return False

    # Skip asset paths
    skip_extensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.xml', '.json', '.rss']
    for ext in skip_extensions:
        if path.endswith(ext):
            return False

    return True
