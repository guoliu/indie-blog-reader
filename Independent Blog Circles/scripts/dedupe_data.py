#!/usr/bin/env python3
"""Deduplicate blogs and edges data."""

import json
import csv
from pathlib import Path
from urllib.parse import urlparse

DATA_DIR = Path(__file__).parent.parent / "data"


def normalize_url(url: str) -> str:
    """Normalize URL for deduplication."""
    if not url:
        return ""

    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if host.startswith('www.'):
        host = host[4:]

    path = parsed.path.rstrip('/')
    if not path:
        path = ''

    return f"{parsed.scheme}://{host}{path}"


def dedupe_blogs():
    """Deduplicate blogs.jsonl keeping the most complete entry for each URL."""
    blogs_file = DATA_DIR / "blogs.jsonl"

    if not blogs_file.exists():
        print("No blogs file found")
        return

    blogs = {}
    duplicates = 0

    with open(blogs_file, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            try:
                blog = json.loads(line)
                url = normalize_url(blog.get('url', ''))
                if not url:
                    continue

                if url in blogs:
                    duplicates += 1
                    # Keep the more complete entry
                    existing = blogs[url]
                    # Prefer complete status over failed
                    if blog.get('scrape_status') == 'complete' and existing.get('scrape_status') != 'complete':
                        blogs[url] = blog
                    # Prefer known SSG over unknown
                    elif blog.get('ssg', 'unknown') != 'unknown' and existing.get('ssg', 'unknown') == 'unknown':
                        blogs[url] = blog
                else:
                    blogs[url] = blog
            except json.JSONDecodeError:
                continue

    print(f"Found {len(blogs)} unique blogs, {duplicates} duplicates removed")

    # Write back
    backup_file = DATA_DIR / "blogs.jsonl.bak"
    blogs_file.rename(backup_file)

    with open(blogs_file, 'w', encoding='utf-8') as f:
        for blog in blogs.values():
            f.write(json.dumps(blog, ensure_ascii=False) + '\n')

    print(f"Wrote deduplicated blogs to {blogs_file}")
    print(f"Backup saved to {backup_file}")


def dedupe_edges():
    """Deduplicate edges.csv."""
    edges_file = DATA_DIR / "edges.csv"

    if not edges_file.exists():
        print("No edges file found")
        return

    edges = set()
    duplicates = 0

    with open(edges_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            source = normalize_url(row['source'])
            target = normalize_url(row['target'])
            edge_type = row['type']

            edge = (source, target, edge_type)
            if edge in edges:
                duplicates += 1
            else:
                edges.add(edge)

    print(f"Found {len(edges)} unique edges, {duplicates} duplicates removed")

    # Write back
    backup_file = DATA_DIR / "edges.csv.bak"
    edges_file.rename(backup_file)

    with open(edges_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['source', 'target', 'type'])
        for source, target, edge_type in edges:
            writer.writerow([source, target, edge_type])

    print(f"Wrote deduplicated edges to {edges_file}")


def dedupe_queue():
    """Deduplicate queue.txt against already-scraped blogs."""
    queue_file = DATA_DIR / "queue.txt"
    blogs_file = DATA_DIR / "blogs.jsonl"

    if not queue_file.exists():
        print("No queue file found")
        return

    # Load already scraped URLs
    scraped = set()
    if blogs_file.exists():
        with open(blogs_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    try:
                        blog = json.loads(line)
                        url = normalize_url(blog.get('url', ''))
                        if url:
                            scraped.add(url)
                    except:
                        continue

    # Read and dedupe queue
    queue = []
    seen = set()
    duplicates = 0

    with open(queue_file, 'r', encoding='utf-8') as f:
        for line in f:
            url = normalize_url(line.strip())
            if not url:
                continue
            if url in seen or url in scraped:
                duplicates += 1
            else:
                queue.append(url)
                seen.add(url)

    print(f"Queue: {len(queue)} unique URLs, {duplicates} duplicates/already-scraped removed")

    # Write back
    with open(queue_file, 'w', encoding='utf-8') as f:
        for url in queue:
            f.write(url + '\n')


def main():
    print("Deduplicating data...\n")

    print("=== Blogs ===")
    dedupe_blogs()

    print("\n=== Edges ===")
    dedupe_edges()

    print("\n=== Queue ===")
    dedupe_queue()

    print("\n✓ Deduplication complete!")


if __name__ == '__main__':
    main()
