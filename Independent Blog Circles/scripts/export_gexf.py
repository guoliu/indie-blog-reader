#!/usr/bin/env python3
"""Export blog graph to GEXF format for Gephi visualization."""

import json
import csv
import xml.etree.ElementTree as ET
from xml.dom import minidom
from pathlib import Path
from datetime import datetime
from collections import defaultdict

DATA_DIR = Path(__file__).parent.parent / "data"
EXPORTS_DIR = Path(__file__).parent.parent / "exports"


def load_blogs() -> dict:
    """Load all blogs as dict keyed by URL."""
    blogs = {}
    blogs_file = DATA_DIR / "blogs.jsonl"

    if not blogs_file.exists():
        return blogs

    with open(blogs_file, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                try:
                    blog = json.loads(line)
                    url = blog.get('url', '')
                    if url:
                        blogs[url] = blog
                except json.JSONDecodeError:
                    continue

    return blogs


def load_circles() -> dict:
    """Load all circles as dict keyed by URL."""
    circles = {}
    circles_file = DATA_DIR / "circles.jsonl"

    if not circles_file.exists():
        return circles

    with open(circles_file, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                try:
                    circle = json.loads(line)
                    url = circle.get('url', '')
                    if url:
                        circles[url] = circle
                except json.JSONDecodeError:
                    continue

    return circles


def load_edges() -> list:
    """Load all edges from CSV."""
    edges = []
    edges_file = DATA_DIR / "edges.csv"

    if not edges_file.exists():
        return edges

    with open(edges_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            edges.append(row)

    return edges


def create_gexf():
    """Create GEXF graph file."""
    blogs = load_blogs()
    circles = load_circles()
    edges = load_edges()

    print(f"Loaded {len(blogs)} blogs, {len(circles)} circles, {len(edges)} edges")

    # Create GEXF structure
    gexf = ET.Element('gexf')
    gexf.set('xmlns', 'http://gexf.net/1.3')
    gexf.set('version', '1.3')

    # Meta
    meta = ET.SubElement(gexf, 'meta')
    meta.set('lastmodifieddate', datetime.now().strftime('%Y-%m-%d'))
    creator = ET.SubElement(meta, 'creator')
    creator.text = 'Chinese Blog Scraper'
    description = ET.SubElement(meta, 'description')
    description.text = 'Network of Chinese independent blogs and blog circles'

    # Graph
    graph = ET.SubElement(gexf, 'graph')
    graph.set('mode', 'static')
    graph.set('defaultedgetype', 'directed')

    # Node attributes
    attributes = ET.SubElement(graph, 'attributes')
    attributes.set('class', 'node')

    attr_defs = [
        ('type', 'string'),  # blog or circle
        ('name', 'string'),
        ('ssg', 'string'),
        ('theme', 'string'),
        ('comment_type', 'string'),
        ('comment_storage', 'string'),
        ('article_count', 'integer'),
        ('scrape_status', 'string'),
    ]

    for i, (name, attr_type) in enumerate(attr_defs):
        attr = ET.SubElement(attributes, 'attribute')
        attr.set('id', str(i))
        attr.set('title', name)
        attr.set('type', attr_type)

    # Nodes
    nodes = ET.SubElement(graph, 'nodes')

    # Collect all unique node URLs
    node_urls = set()
    for blog_url in blogs:
        node_urls.add(blog_url)
    for circle_url in circles:
        node_urls.add(circle_url)
    for edge in edges:
        node_urls.add(edge['source'])
        node_urls.add(edge['target'])

    # Map URLs to IDs
    url_to_id = {url: str(i) for i, url in enumerate(node_urls)}

    # SSG color mapping for visualization hints
    ssg_colors = {
        'hexo': '#0E83CD',
        'hugo': '#FF4088',
        'astro': '#FF5D01',
        'vitepress': '#42b883',
        'vuepress': '#42b883',
        'gatsby': '#663399',
        'nextjs': '#000000',
        'wordpress': '#21759B',
        'typecho': '#497E8E',
        'ghost': '#15171A',
        'jekyll': '#CC0000',
        'halo': '#4CCBA0',
        'unknown': '#888888',
    }

    for url in node_urls:
        node = ET.SubElement(nodes, 'node')
        node.set('id', url_to_id[url])
        node.set('label', url)

        # Determine node type and attributes
        attvalues = ET.SubElement(node, 'attvalues')

        if url in blogs:
            blog = blogs[url]

            # Type
            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '0')
            av.set('value', 'blog')

            # Name
            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '1')
            av.set('value', blog.get('name', '') or '')

            # SSG
            ssg = blog.get('ssg', 'unknown')
            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '2')
            av.set('value', ssg)

            # Theme
            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '3')
            av.set('value', blog.get('theme', '') or '')

            # Comment type
            comment = blog.get('comment_system', {})
            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '4')
            av.set('value', comment.get('type', 'none') or 'none')

            # Comment storage
            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '5')
            av.set('value', comment.get('storage', '') or '')

            # Article count
            activity = blog.get('activity', {})
            article_count = activity.get('article_count')
            if article_count:
                av = ET.SubElement(attvalues, 'attvalue')
                av.set('for', '6')
                av.set('value', str(article_count))

            # Scrape status
            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '7')
            av.set('value', blog.get('scrape_status', 'unknown'))

            # Add viz color based on SSG
            viz_color = ET.SubElement(node, 'viz:color')
            viz_color.set('xmlns:viz', 'http://gexf.net/1.3/viz')
            color = ssg_colors.get(ssg, ssg_colors['unknown'])
            # Convert hex to RGB
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            viz_color.set('r', str(r))
            viz_color.set('g', str(g))
            viz_color.set('b', str(b))

            # Size based on article count
            viz_size = ET.SubElement(node, 'viz:size')
            viz_size.set('xmlns:viz', 'http://gexf.net/1.3/viz')
            size = min(50, max(10, (article_count or 10) / 5))
            viz_size.set('value', str(size))

        elif url in circles:
            circle = circles[url]

            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '0')
            av.set('value', 'circle')

            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '1')
            av.set('value', circle.get('name', ''))

            # Make circles larger and different color
            viz_color = ET.SubElement(node, 'viz:color')
            viz_color.set('xmlns:viz', 'http://gexf.net/1.3/viz')
            viz_color.set('r', '255')
            viz_color.set('g', '215')
            viz_color.set('b', '0')  # Gold color for circles

            viz_size = ET.SubElement(node, 'viz:size')
            viz_size.set('xmlns:viz', 'http://gexf.net/1.3/viz')
            viz_size.set('value', '30')

        else:
            # Unknown node (appeared in edges but not scraped)
            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '0')
            av.set('value', 'unknown')

            av = ET.SubElement(attvalues, 'attvalue')
            av.set('for', '7')
            av.set('value', 'not_scraped')

    # Edges
    edges_elem = ET.SubElement(graph, 'edges')

    for i, edge in enumerate(edges):
        source = edge['source']
        target = edge['target']
        edge_type = edge['type']

        if source not in url_to_id or target not in url_to_id:
            continue

        e = ET.SubElement(edges_elem, 'edge')
        e.set('id', str(i))
        e.set('source', url_to_id[source])
        e.set('target', url_to_id[target])
        e.set('label', edge_type)

        # Different weight for different edge types
        if edge_type == 'friend_link':
            e.set('weight', '1.0')
        else:  # circle_member
            e.set('weight', '0.5')

    # Pretty print
    xml_str = ET.tostring(gexf, encoding='unicode')
    dom = minidom.parseString(xml_str)
    pretty_xml = dom.toprettyxml(indent='  ')

    # Remove extra blank lines
    lines = [line for line in pretty_xml.split('\n') if line.strip()]
    pretty_xml = '\n'.join(lines)

    # Save
    EXPORTS_DIR.mkdir(exist_ok=True)
    output_file = EXPORTS_DIR / "graph.gexf"

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(pretty_xml)

    print(f"Exported to {output_file}")

    # Also create a summary
    summary = {
        'total_blogs': len(blogs),
        'total_circles': len(circles),
        'total_edges': len(edges),
        'ssg_distribution': defaultdict(int),
        'comment_distribution': defaultdict(int),
        'exported_at': datetime.now().isoformat(),
    }

    for blog in blogs.values():
        summary['ssg_distribution'][blog.get('ssg', 'unknown')] += 1
        comment = blog.get('comment_system', {})
        summary['comment_distribution'][comment.get('type', 'none')] += 1

    summary['ssg_distribution'] = dict(summary['ssg_distribution'])
    summary['comment_distribution'] = dict(summary['comment_distribution'])

    summary_file = EXPORTS_DIR / "summary.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"Summary saved to {summary_file}")
    print(f"\nSSG Distribution:")
    for ssg, count in sorted(summary['ssg_distribution'].items(), key=lambda x: -x[1]):
        print(f"  {ssg}: {count}")

    print(f"\nComment System Distribution:")
    for system, count in sorted(summary['comment_distribution'].items(), key=lambda x: -x[1]):
        print(f"  {system}: {count}")


if __name__ == '__main__':
    create_gexf()
