"""Tests for RSS feed parsing."""

import pytest
from unittest.mock import Mock, patch, AsyncMock
import asyncio


class TestRssFetcher:
    """Test RSS feed discovery and parsing."""

    def test_discover_rss_from_known_ssg_hexo(self):
        """Hexo blogs should try /atom.xml first."""
        from rss import get_rss_paths_for_ssg

        paths = get_rss_paths_for_ssg("hexo")
        assert "/atom.xml" in paths
        assert "/rss.xml" in paths

    def test_discover_rss_from_known_ssg_hugo(self):
        """Hugo blogs should try /index.xml first."""
        from rss import get_rss_paths_for_ssg

        paths = get_rss_paths_for_ssg("hugo")
        assert "/index.xml" in paths
        assert "/feed.xml" in paths

    def test_discover_rss_from_known_ssg_wordpress(self):
        """WordPress blogs should try /feed/ first."""
        from rss import get_rss_paths_for_ssg

        paths = get_rss_paths_for_ssg("wordpress")
        assert "/feed/" in paths

    def test_discover_rss_from_unknown_ssg(self):
        """Unknown SSG should return common RSS paths."""
        from rss import get_rss_paths_for_ssg

        paths = get_rss_paths_for_ssg("unknown")
        assert len(paths) > 0
        # Should include common paths
        assert any("/feed" in p or "/rss" in p or "/atom" in p for p in paths)

    def test_parse_rss_extracts_articles(self):
        """Parse RSS feed and extract article metadata."""
        from rss import parse_rss_content

        rss_content = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
            <channel>
                <title>Test Blog</title>
                <item>
                    <title>Test Article</title>
                    <link>https://example.com/post1</link>
                    <description>This is a test article description.</description>
                    <pubDate>Mon, 13 Jan 2025 10:00:00 +0000</pubDate>
                </item>
            </channel>
        </rss>"""

        articles = parse_rss_content(rss_content)

        assert len(articles) == 1
        assert articles[0]["title"] == "Test Article"
        assert articles[0]["url"] == "https://example.com/post1"
        assert "test article description" in articles[0]["description"].lower()

    def test_parse_atom_extracts_articles(self):
        """Parse Atom feed and extract article metadata."""
        from rss import parse_rss_content

        atom_content = """<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
            <title>Test Blog</title>
            <entry>
                <title>Atom Article</title>
                <link href="https://example.com/atom-post"/>
                <summary>Atom article summary.</summary>
                <published>2025-01-13T10:00:00Z</published>
            </entry>
        </feed>"""

        articles = parse_rss_content(atom_content)

        assert len(articles) == 1
        assert articles[0]["title"] == "Atom Article"
        assert articles[0]["url"] == "https://example.com/atom-post"

    def test_parse_rss_extracts_cover_image(self):
        """Parse RSS feed with media:thumbnail for cover image."""
        from rss import parse_rss_content

        rss_content = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
            <channel>
                <title>Test Blog</title>
                <item>
                    <title>Post with Image</title>
                    <link>https://example.com/post</link>
                    <media:thumbnail url="https://example.com/cover.jpg"/>
                </item>
            </channel>
        </rss>"""

        articles = parse_rss_content(rss_content)

        assert len(articles) == 1
        assert articles[0]["cover_image"] == "https://example.com/cover.jpg"

    def test_parse_rss_extracts_enclosure_image(self):
        """Parse RSS feed with enclosure for cover image."""
        from rss import parse_rss_content

        rss_content = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
            <channel>
                <title>Test Blog</title>
                <item>
                    <title>Post with Enclosure</title>
                    <link>https://example.com/post</link>
                    <enclosure url="https://example.com/image.png" type="image/png"/>
                </item>
            </channel>
        </rss>"""

        articles = parse_rss_content(rss_content)

        assert len(articles) == 1
        assert articles[0]["cover_image"] == "https://example.com/image.png"


class TestDiscoverRssFromHtml:
    """Test RSS discovery from HTML."""

    @pytest.mark.asyncio
    async def test_discover_rss_from_link_tag(self):
        """Find RSS URL from link rel=alternate tag."""
        from rss import discover_rss_from_html

        html = """
        <html>
        <head>
            <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="RSS">
        </head>
        </html>
        """

        rss_url = await discover_rss_from_html("https://example.com", html)
        assert rss_url == "https://example.com/feed.xml"

    @pytest.mark.asyncio
    async def test_discover_rss_from_atom_link(self):
        """Find Atom feed URL from link tag."""
        from rss import discover_rss_from_html

        html = """
        <html>
        <head>
            <link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml">
        </head>
        </html>
        """

        rss_url = await discover_rss_from_html("https://example.com", html)
        assert rss_url == "https://example.com/atom.xml"

    @pytest.mark.asyncio
    async def test_discover_rss_returns_none_when_not_found(self):
        """Return None when no RSS link found."""
        from rss import discover_rss_from_html

        html = """
        <html>
        <head>
            <title>No RSS here</title>
        </head>
        </html>
        """

        rss_url = await discover_rss_from_html("https://example.com", html)
        assert rss_url is None
