#!/usr/bin/env python3
"""Create interactive HTML visualization of blog network."""

import json
import csv
import random
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path(__file__).parent.parent / "data"
EXPORTS_DIR = Path(__file__).parent.parent / "exports"

# Color scheme for SSGs
SSG_COLORS = {
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
    'nuxt': '#00DC82',
    'docusaurus': '#25c2a0',
    'mkdocs': '#526CFE',
    'gridea': '#5B8AF1',
    'zola': '#FF6B6B',
    'notion': '#000000',
    '11ty': '#222222',
    'pelican': '#4A90A4',
    'docsify': '#42b983',
    'unknown': '#888888',
}


def load_data():
    """Load blogs and edges."""
    blogs = {}
    blogs_file = DATA_DIR / "blogs.jsonl"

    if blogs_file.exists():
        with open(blogs_file, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    try:
                        blog = json.loads(line)
                        url = blog.get('url', '')
                        if url and blog.get('scrape_status') == 'complete':
                            blogs[url] = blog
                    except:
                        continue

    edges = []
    edges_file = DATA_DIR / "edges.csv"

    if edges_file.exists():
        with open(edges_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row['type'] == 'friend_link':  # Only friend links for cleaner viz
                    edges.append((row['source'], row['target']))

    return blogs, edges


def create_cosmograph_csv():
    """Create CSV files optimized for Cosmograph."""
    blogs, edges = load_data()
    print(f"Loaded {len(blogs)} blogs, {len(edges)} friend link edges")

    # Filter to only include blogs that have connections
    connected_blogs = set()
    for source, target in edges:
        if source in blogs:
            connected_blogs.add(source)
        if target in blogs:
            connected_blogs.add(target)

    print(f"Blogs with connections: {len(connected_blogs)}")

    # Count connections per blog
    connection_count = defaultdict(int)
    for source, target in edges:
        connection_count[source] += 1
        connection_count[target] += 1

    # Create nodes CSV for Cosmograph
    nodes_file = EXPORTS_DIR / "nodes.csv"
    with open(nodes_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'label', 'ssg', 'color', 'size'])

        for url in connected_blogs:
            blog = blogs.get(url, {})
            name = blog.get('name', url)
            if name:
                # Clean up name
                name = name[:50]  # Truncate long names
            else:
                name = url.replace('https://', '').replace('http://', '')[:30]

            ssg = blog.get('ssg', 'unknown')
            color = SSG_COLORS.get(ssg, SSG_COLORS['unknown'])
            size = min(50, max(5, connection_count[url] * 2))

            writer.writerow([url, name, ssg, color, size])

    print(f"Wrote {len(connected_blogs)} nodes to {nodes_file}")

    # Create edges CSV for Cosmograph
    edges_file_out = EXPORTS_DIR / "links.csv"
    valid_edges = [(s, t) for s, t in edges if s in connected_blogs and t in connected_blogs]

    with open(edges_file_out, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['source', 'target'])
        for source, target in valid_edges:
            writer.writerow([source, target])

    print(f"Wrote {len(valid_edges)} edges to {edges_file_out}")

    return len(connected_blogs), len(valid_edges)


def create_summary_stats():
    """Create a detailed summary for analysis."""
    blogs, edges = load_data()

    # SSG distribution
    ssg_counts = defaultdict(int)
    comment_counts = defaultdict(int)

    for blog in blogs.values():
        ssg_counts[blog.get('ssg', 'unknown')] += 1
        comment = blog.get('comment_system', {})
        comment_counts[comment.get('type', 'none')] += 1

    # Connection statistics
    connection_count = defaultdict(int)
    for source, target in edges:
        connection_count[source] += 1
        connection_count[target] += 1

    # Find most connected blogs
    top_connected = sorted(connection_count.items(), key=lambda x: -x[1])[:50]

    summary = {
        'total_blogs': len(blogs),
        'total_edges': len(edges),
        'ssg_distribution': dict(sorted(ssg_counts.items(), key=lambda x: -x[1])),
        'comment_distribution': dict(sorted(comment_counts.items(), key=lambda x: -x[1])),
        'top_connected_blogs': [
            {
                'url': url,
                'name': blogs.get(url, {}).get('name', url),
                'connections': count,
                'ssg': blogs.get(url, {}).get('ssg', 'unknown')
            }
            for url, count in top_connected if url in blogs
        ]
    }

    summary_file = EXPORTS_DIR / "detailed_summary.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\nTop 20 most connected blogs:")
    for item in summary['top_connected_blogs'][:20]:
        print(f"  {item['connections']:3d} connections: {item['name'][:40]} ({item['ssg']})")

    return summary


def create_html_visualization():
    """Create a simple HTML visualization using D3.js force layout."""
    blogs, edges = load_data()

    # Filter to top connected blogs for performance
    connection_count = defaultdict(int)
    for source, target in edges:
        connection_count[source] += 1
        connection_count[target] += 1

    # Get top 500 most connected blogs
    top_blogs = set(url for url, _ in sorted(connection_count.items(), key=lambda x: -x[1])[:500])

    # Filter edges to only include top blogs
    filtered_edges = [(s, t) for s, t in edges if s in top_blogs and t in top_blogs]

    # Build nodes data
    nodes_data = []
    for url in top_blogs:
        blog = blogs.get(url, {})
        ssg = blog.get('ssg', 'unknown')
        nodes_data.append({
            'id': url,
            'name': (blog.get('name') or url.replace('https://', ''))[:30],
            'ssg': ssg,
            'color': SSG_COLORS.get(ssg, '#888'),
            'size': min(30, max(5, connection_count[url]))
        })

    # Build edges data
    edges_data = [{'source': s, 'target': t} for s, t in filtered_edges]

    html_content = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Chinese Independent Blogs Network</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {{ margin: 0; font-family: Arial, sans-serif; background: #1a1a2e; }}
        #graph {{ width: 100vw; height: 100vh; }}
        .node {{ cursor: pointer; }}
        .node:hover {{ stroke: white; stroke-width: 2px; }}
        .link {{ stroke: #444; stroke-opacity: 0.6; }}
        .tooltip {{
            position: absolute;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            pointer-events: none;
        }}
        #legend {{
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.7);
            padding: 15px;
            border-radius: 8px;
            color: white;
            font-size: 11px;
        }}
        #legend h3 {{ margin: 0 0 10px 0; font-size: 14px; }}
        .legend-item {{ display: flex; align-items: center; margin: 4px 0; }}
        .legend-color {{ width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }}
        #stats {{
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.7);
            padding: 15px;
            border-radius: 8px;
            color: white;
            font-size: 12px;
        }}
        #controls {{
            position: fixed;
            bottom: 10px;
            left: 10px;
            background: rgba(0,0,0,0.7);
            padding: 10px;
            border-radius: 8px;
            color: white;
        }}
        button {{ margin: 2px; padding: 5px 10px; cursor: pointer; }}
    </style>
</head>
<body>
    <div id="graph"></div>
    <div id="stats">
        <strong>Chinese Blog Network</strong><br>
        Nodes: {len(nodes_data)} (top connected)<br>
        Edges: {len(edges_data)}<br>
        <small>Full dataset: {len(blogs)} blogs</small>
    </div>
    <div id="legend">
        <h3>SSG Types</h3>
        <div class="legend-item"><div class="legend-color" style="background: #0E83CD"></div>Hexo</div>
        <div class="legend-item"><div class="legend-color" style="background: #21759B"></div>WordPress</div>
        <div class="legend-item"><div class="legend-color" style="background: #497E8E"></div>Typecho</div>
        <div class="legend-item"><div class="legend-color" style="background: #42b883"></div>Vue/VitePress</div>
        <div class="legend-item"><div class="legend-color" style="background: #FF5D01"></div>Astro</div>
        <div class="legend-item"><div class="legend-color" style="background: #FF4088"></div>Hugo</div>
        <div class="legend-item"><div class="legend-color" style="background: #4CCBA0"></div>Halo</div>
        <div class="legend-item"><div class="legend-color" style="background: #888888"></div>Unknown/Other</div>
    </div>
    <div id="controls">
        <button onclick="zoomIn()">Zoom +</button>
        <button onclick="zoomOut()">Zoom -</button>
        <button onclick="resetZoom()">Reset</button>
    </div>
    <div class="tooltip" style="display: none;"></div>

    <script>
        const nodes = {json.dumps(nodes_data)};
        const links = {json.dumps(edges_data)};

        const width = window.innerWidth;
        const height = window.innerHeight;

        const svg = d3.select("#graph")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        const g = svg.append("g");

        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => g.attr("transform", event.transform));

        svg.call(zoom);

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(50))
            .force("charge", d3.forceManyBody().strength(-100))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(d => d.size + 2));

        const link = g.append("g")
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("class", "link");

        const node = g.append("g")
            .selectAll("circle")
            .data(nodes)
            .join("circle")
            .attr("class", "node")
            .attr("r", d => d.size)
            .attr("fill", d => d.color)
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        const tooltip = d3.select(".tooltip");

        node.on("mouseover", (event, d) => {{
            tooltip.style("display", "block")
                .html(`<strong>${{d.name}}</strong><br>SSG: ${{d.ssg}}<br>Connections: ${{d.size}}<br><small>${{d.id}}</small>`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 10) + "px");
        }})
        .on("mouseout", () => tooltip.style("display", "none"))
        .on("click", (event, d) => window.open(d.id, "_blank"));

        simulation.on("tick", () => {{
            link.attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            node.attr("cx", d => d.x).attr("cy", d => d.y);
        }});

        function dragstarted(event) {{
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }}

        function dragged(event) {{
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }}

        function dragended(event) {{
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }}

        function zoomIn() {{ svg.transition().call(zoom.scaleBy, 1.5); }}
        function zoomOut() {{ svg.transition().call(zoom.scaleBy, 0.67); }}
        function resetZoom() {{ svg.transition().call(zoom.transform, d3.zoomIdentity); }}
    </script>
</body>
</html>'''

    html_file = EXPORTS_DIR / "network.html"
    with open(html_file, 'w', encoding='utf-8') as f:
        f.write(html_content)

    print(f"\nCreated interactive visualization: {html_file}")
    print(f"Open in browser to explore (shows top 500 connected blogs)")


if __name__ == '__main__':
    EXPORTS_DIR.mkdir(exist_ok=True)

    print("Creating Cosmograph-compatible CSV files...")
    node_count, edge_count = create_cosmograph_csv()

    print("\nGenerating detailed summary...")
    create_summary_stats()

    print("\nCreating interactive HTML visualization...")
    create_html_visualization()

    print(f"\n✓ All exports complete!")
    print(f"  - nodes.csv & links.csv: Upload to https://cosmograph.app/")
    print(f"  - network.html: Open in browser for quick preview")
    print(f"  - detailed_summary.json: Analysis data")
