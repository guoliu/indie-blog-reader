#!/usr/bin/env python3
"""Deduplicate blogs and edges data."""

import json
import csv
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path(__file__).parent.parent / "data"


def normalize_url(url: str) -> str:
    """Normalize URL for deduplication."""
    if not url:
        return ""

    # Add scheme if missing
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    from urllib.parse import urlparse
    parsed = urlparse(url)

    # Normalize: lowercase host, remove www, remove trailing slash
    host = parsed.netloc.lower()
    if host.startswith('www.'):
        host = host[4:]

    path = parsed.path.rstrip('/')
    if not path:
        path = ''

    return f"{parsed.scheme}://{host}{path}"


def deduplicate_blogs():
    """Deduplicate blogs.jsonl, keeping the most complete entry for each URL."""
    blogs_file = DATA_DIR / "blogs.jsonl"

    if not blogs_file.exists():
        print("No blogs file found")
        return

    # Load all blogs, keeping best entry per URL
    blogs_by_url = {}
    total_entries = 0

    with open(blogs_file, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            total_entries += 1
            try:
                blog = json.loads(line)
                url = normalize_url(blog.get('url', ''))
                if not url:
                    continue

                # If we already have this URL, keep the more complete one
                if url in blogs_by_url:
                    existing = blogs_by_url[url]
                    # Prefer complete status over failed
                    if existing.get('scrape_status') == 'failed' and blog.get('scrape_status') == 'complete':
                        blogs_by_url[url] = blog
                    # Prefer entry with name
                    elif not existing.get('name') and blog.get('name'):
                        blogs_by_url[url] = blog
                    # Prefer entry with known SSG
                    elif existing.get('ssg') == 'unknown' and blog.get('ssg') != 'unknown':
                        blogs_by_url[url] = blog
                else:
                    blogs_by_url[url] = blog

            except json.JSONDecodeError:
                continue

    # Write deduplicated blogs
    backup_file = DATA_DIR / "blogs.jsonl.bak"
    blogs_file.rename(backup_file)

    with open(blogs_file, 'w', encoding='utf-8') as f:
        for url, blog in blogs_by_url.items():
            # Ensure URL is normalized in the saved data
            blog['url'] = url
            f.write(json.dumps(blog, ensure_ascii=False) + '\n')

    print(f"Blogs: {total_entries} entries -> {len(blogs_by_url)} unique (removed {total_entries - len(blogs_by_url)} duplicates)")
    return blogs_by_url


def deduplicate_edges():
    """Deduplicate edges.csv."""
    edges_file = DATA_DIR / "edges.csv"

    if not edges_file.exists():
        print("No edges file found")
        return

    # Load all edges, deduplicating
    unique_edges = set()
    total_edges = 0

    with open(edges_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            total_edges += 1
            source = normalize_url(row['source'])
            target = normalize_url(row['target'])
            edge_type = row['type']

            if source and target:
                unique_edges.add((source, target, edge_type))

    # Write deduplicated edges
    backup_file = DATA_DIR / "edges.csv.bak"
    edges_file.rename(backup_file)

    with open(edges_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['source', 'target', 'type'])
        for source, target, edge_type in unique_edges:
            writer.writerow([source, target, edge_type])

    print(f"Edges: {total_edges} entries -> {len(unique_edges)} unique (removed {total_edges - len(unique_edges)} duplicates)")
    return unique_edges


def deduplicate_queue():
    """Deduplicate queue.txt and remove already-scraped URLs."""
    queue_file = DATA_DIR / "queue.txt"
    blogs_file = DATA_DIR / "blogs.jsonl"

    # Load scraped URLs
    scraped_urls = set()
    if blogs_file.exists():
        with open(blogs_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    try:
                        blog = json.loads(line)
                        url = normalize_url(blog.get('url', ''))
                        if url:
                            scraped_urls.add(url)
                    except:
                        continue

    if not queue_file.exists():
        print("No queue file found")
        return

    # Load and deduplicate queue
    unique_queue = []
    seen = set()
    total_queue = 0

    with open(queue_file, 'r', encoding='utf-8') as f:
        for line in f:
            url = line.strip()
            if not url:
                continue
            total_queue += 1
            normalized = normalize_url(url)

            # Skip if already scraped or already in queue
            if normalized and normalized not in scraped_urls and normalized not in seen:
                unique_queue.append(normalized)
                seen.add(normalized)

    # Write deduplicated queue
    with open(queue_file, 'w', encoding='utf-8') as f:
        for url in unique_queue:
            f.write(url + '\n')

    print(f"Queue: {total_queue} entries -> {len(unique_queue)} unique new URLs (removed {total_queue - len(unique_queue)})")
    return unique_queue


def main():
    print("=== Deduplicating data ===\n")

    deduplicate_blogs()
    deduplicate_edges()
    deduplicate_queue()

    print("\n=== Deduplication complete ===")
    print("Backup files created with .bak extension")


if __name__ == '__main__':
    main()
