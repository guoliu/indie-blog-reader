"""Database operations for the scraper."""

import sqlite3
from pathlib import Path
from typing import Optional
from datetime import datetime

DB_PATH = Path(__file__).parent.parent / "data" / "blog-monitor.db"


def get_connection() -> sqlite3.Connection:
    """Get a database connection."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def get_blogs_to_scrape(limit: Optional[int] = None) -> list[dict]:
    """Get blogs that need scraping, ordered by last_scraped_at."""
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        SELECT id, url, name, ssg, comment_system, rss_url
        FROM blogs
        ORDER BY last_scraped_at ASC NULLS FIRST
    """

    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query)
    blogs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return blogs


def save_articles(blog_id: int, articles: list[dict]) -> int:
    """Save articles to the database. Returns count of new articles."""
    conn = get_connection()
    cursor = conn.cursor()
    new_count = 0

    for article in articles:
        try:
            cursor.execute(
                """
                INSERT INTO articles (blog_id, url, title, description, cover_image, published_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    blog_id,
                    article.get("url"),
                    article.get("title"),
                    article.get("description"),
                    article.get("cover_image"),
                    article.get("published_at"),
                ),
            )
            new_count += 1
        except sqlite3.IntegrityError:
            # Article already exists
            pass

    conn.commit()
    conn.close()
    return new_count


def update_blog_rss_url(blog_id: int, rss_url: str) -> None:
    """Update the discovered RSS URL for a blog."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE blogs SET rss_url = ? WHERE id = ?",
        (rss_url, blog_id),
    )
    conn.commit()
    conn.close()


def update_blog_scraped_at(blog_id: int) -> None:
    """Update the last_scraped_at timestamp for a blog."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE blogs SET last_scraped_at = ? WHERE id = ?",
        (datetime.now().isoformat(), blog_id),
    )
    conn.commit()
    conn.close()


def get_blog_count() -> int:
    """Get total number of blogs."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM blogs")
    count = cursor.fetchone()[0]
    conn.close()
    return count


def get_article_count() -> int:
    """Get total number of articles."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM articles")
    count = cursor.fetchone()[0]
    conn.close()
    return count
