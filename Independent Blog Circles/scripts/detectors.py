"""Detectors for SSG, themes, and comment systems."""

import re
from typing import Optional, Dict, Any

# SSG Detection patterns
SSG_PATTERNS = {
    'hexo': {
        'meta_generator': [r'hexo', r'Hexo'],
        'html_signatures': [
            r'Powered by.*Hexo',
            r'hexo-.*\.js',
            r'hexo-.*\.css',
            r'/lib/hexo',
        ],
        'paths': ['/archives/', '/tags/', '/categories/'],  # Common Hexo paths
    },
    'hugo': {
        'meta_generator': [r'Hugo\s*[\d.]*'],
        'html_signatures': [
            r'data-hugo',
            r'hugo-.*\.js',
            r'/hugo_stats\.json',
        ],
        'paths': [],
    },
    'astro': {
        'meta_generator': [r'Astro'],
        'html_signatures': [
            r'astro-island',
            r'astro-slot',
            r'/_astro/',
            r'data-astro',
        ],
        'paths': ['/_astro/'],
    },
    'vitepress': {
        'meta_generator': [r'vitepress', r'VitePress'],
        'html_signatures': [
            r'vitepress',
            r'VPContent',
            r'VPDoc',
            r'@vitepress',
        ],
        'paths': [],
    },
    'vuepress': {
        'meta_generator': [r'vuepress', r'VuePress'],
        'html_signatures': [
            r'vuepress',
            r'nprogress',
            r'theme-container',
        ],
        'paths': [],
    },
    'gatsby': {
        'meta_generator': [r'Gatsby'],
        'html_signatures': [
            r'___gatsby',
            r'gatsby-',
            r'/page-data/',
        ],
        'paths': ['/page-data/'],
    },
    'nextjs': {
        'meta_generator': [r'Next\.js'],
        'html_signatures': [
            r'_next/',
            r'__NEXT_DATA__',
            r'next/dist',
        ],
        'paths': ['/_next/'],
    },
    'jekyll': {
        'meta_generator': [r'Jekyll'],
        'html_signatures': [
            r'jekyll',
            r'Powered by.*Jekyll',
        ],
        'paths': [],
    },
    'wordpress': {
        'meta_generator': [r'WordPress'],
        'html_signatures': [
            r'/wp-content/',
            r'/wp-includes/',
            r'wp-json',
        ],
        'paths': ['/wp-content/', '/wp-includes/'],
    },
    'typecho': {
        'meta_generator': [r'Typecho'],
        'html_signatures': [
            r'Typecho',
            r'Powered by.*Typecho',
        ],
        'paths': [],
    },
    'ghost': {
        'meta_generator': [r'Ghost'],
        'html_signatures': [
            r'/assets/built/',
            r'ghost-',
            r'content/images',
        ],
        'paths': ['/ghost/'],
    },
    'gridea': {
        'meta_generator': [r'Gridea'],
        'html_signatures': [
            r'Gridea',
            r'Powered by.*Gridea',
        ],
        'paths': [],
    },
    'halo': {
        'meta_generator': [r'Halo'],
        'html_signatures': [
            r'Halo',
            r'Powered by.*Halo',
            r'/themes/.*halo',
        ],
        'paths': [],
    },
    '11ty': {
        'meta_generator': [r'Eleventy', r'11ty'],
        'html_signatures': [
            r'eleventy',
            r'11ty',
        ],
        'paths': [],
    },
    'nuxt': {
        'meta_generator': [r'Nuxt'],
        'html_signatures': [
            r'__nuxt',
            r'nuxt',
            r'/_nuxt/',
        ],
        'paths': ['/_nuxt/'],
    },
    'zola': {
        'meta_generator': [r'Zola'],
        'html_signatures': [
            r'zola',
            r'Powered by.*Zola',
        ],
        'paths': [],
    },
    'pelican': {
        'meta_generator': [r'Pelican'],
        'html_signatures': [
            r'pelican',
            r'Powered by.*Pelican',
        ],
        'paths': [],
    },
    'mkdocs': {
        'meta_generator': [r'mkdocs', r'MkDocs'],
        'html_signatures': [
            r'mkdocs',
            r'MkDocs',
        ],
        'paths': [],
    },
    'docsify': {
        'meta_generator': [],
        'html_signatures': [
            r'docsify',
            r'Docsify',
        ],
        'paths': [],
    },
    'docusaurus': {
        'meta_generator': [r'Docusaurus'],
        'html_signatures': [
            r'docusaurus',
            r'Docusaurus',
            r'__docusaurus',
        ],
        'paths': [],
    },
    'notion': {
        'meta_generator': [],
        'html_signatures': [
            r'notion-',
            r'super\.so',
            r'notion\.site',
        ],
        'paths': [],
    },
}

# Comment system patterns
COMMENT_PATTERNS = {
    'giscus': {
        'signatures': [r'giscus\.app', r'data-repo=', r'class="giscus"'],
        'storage': 'GitHub Discussions',
        'identity': 'GitHub',
    },
    'waline': {
        'signatures': [r'waline', r'Waline', r'data-server-url', r'waline\.js'],
        'storage': 'self-hosted (Vercel/LeanCloud)',
        'identity': 'anonymous/social login',
    },
    'twikoo': {
        'signatures': [r'twikoo', r'Twikoo', r'envId'],
        'storage': 'self-hosted (Vercel/Tencent Cloud)',
        'identity': 'anonymous/social login',
    },
    'artalk': {
        'signatures': [r'artalk', r'Artalk', r'Artalk\.init'],
        'storage': 'self-hosted',
        'identity': 'anonymous/email',
    },
    'disqus': {
        'signatures': [r'disqus\.com', r'disqus_shortname', r'disqus_thread'],
        'storage': 'Disqus',
        'identity': 'Disqus account',
    },
    'utterances': {
        'signatures': [r'utteranc\.es', r'utterances'],
        'storage': 'GitHub Issues',
        'identity': 'GitHub',
    },
    'gitalk': {
        'signatures': [r'gitalk', r'Gitalk'],
        'storage': 'GitHub Issues',
        'identity': 'GitHub',
    },
    'valine': {
        'signatures': [r'valine', r'Valine', r'leancloud'],
        'storage': 'LeanCloud',
        'identity': 'anonymous',
    },
    'cusdis': {
        'signatures': [r'cusdis', r'Cusdis'],
        'storage': 'self-hosted',
        'identity': 'anonymous',
    },
    'isso': {
        'signatures': [r'isso', r'/isso/'],
        'storage': 'self-hosted (SQLite)',
        'identity': 'anonymous',
    },
    'remark42': {
        'signatures': [r'remark42', r'remark_config'],
        'storage': 'self-hosted',
        'identity': 'anonymous/social login',
    },
    'commento': {
        'signatures': [r'commento', r'commento\.io'],
        'storage': 'Commento/self-hosted',
        'identity': 'anonymous/social login',
    },
    'discuss': {
        'signatures': [r'discuss\.', r'#discuss'],
        'storage': 'self-hosted',
        'identity': 'various',
    },
}


def detect_ssg(html: str, headers: dict = None) -> str:
    """Detect static site generator from HTML content."""
    html_lower = html.lower()

    # Check meta generator first
    generator_match = re.search(r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
    if not generator_match:
        generator_match = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']generator["\']', html, re.IGNORECASE)

    generator = generator_match.group(1) if generator_match else ''

    for ssg_name, patterns in SSG_PATTERNS.items():
        # Check meta generator
        for pattern in patterns['meta_generator']:
            if re.search(pattern, generator, re.IGNORECASE):
                return ssg_name

        # Check HTML signatures
        for pattern in patterns['html_signatures']:
            if re.search(pattern, html, re.IGNORECASE):
                return ssg_name

    return 'unknown'


def detect_theme(html: str, ssg: str) -> Optional[str]:
    """Try to detect theme name from HTML."""
    # Look for theme mentions in comments
    theme_patterns = [
        r'theme[:\s]+["\']?([a-zA-Z0-9_-]+)["\']?',
        r'Theme[:\s]+["\']?([a-zA-Z0-9_-]+)["\']?',
        r'主题[:\s：]+["\']?([a-zA-Z0-9_-]+)["\']?',
        r'/themes?/([a-zA-Z0-9_-]+)/',
    ]

    for pattern in theme_patterns:
        match = re.search(pattern, html)
        if match:
            theme = match.group(1)
            # Filter out common false positives
            if theme.lower() not in ['the', 'this', 'a', 'an', 'color', 'dark', 'light', 'default']:
                return theme

    return None


def detect_comment_system(html: str) -> Dict[str, Any]:
    """Detect comment system from HTML content."""
    result = {
        'type': 'none',
        'storage': None,
        'identity': None,
    }

    for system_name, patterns in COMMENT_PATTERNS.items():
        for signature in patterns['signatures']:
            if re.search(signature, html, re.IGNORECASE):
                result['type'] = system_name
                result['storage'] = patterns['storage']
                result['identity'] = patterns['identity']
                return result

    # Check for generic comment sections without identified system
    if re.search(r'comment|评论|留言', html, re.IGNORECASE):
        # Has comment section but system not identified
        result['type'] = 'unknown'

    return result


def count_articles(html: str, base_url: str) -> int:
    """Try to count articles from archive page or post list."""
    count = 0

    # Look for archive/post listings
    # Common patterns: /post/, /posts/, /article/, /blog/, date-based URLs
    post_patterns = [
        r'href=["\'][^"\']*/(post|posts|article|blog|archives?)/[^"\']*["\']',
        r'href=["\'][^"\']*\d{4}/\d{2}/[^"\']*["\']',  # Date-based URLs
        r'href=["\'][^"\']*\d{4}-\d{2}-\d{2}[^"\']*["\']',  # Date in filename
    ]

    seen_urls = set()
    for pattern in post_patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        for match in matches:
            if match not in seen_urls:
                seen_urls.add(match)
                count += 1

    # Also try to find explicit article counts
    count_patterns = [
        r'共\s*(\d+)\s*篇',
        r'(\d+)\s*篇文章',
        r'(\d+)\s*articles?',
        r'(\d+)\s*posts?',
        r'总计.*?(\d+).*?篇',
    ]

    for pattern in count_patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            explicit_count = int(match.group(1))
            if explicit_count > count:
                count = explicit_count

    return count if count > 0 else None


def extract_blog_name(html: str, url: str) -> str:
    """Extract blog name from HTML."""
    # Try title tag first
    title_match = re.search(r'<title[^>]*>([^<]+)</title>', html, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip()
        # Clean up common suffixes
        title = re.sub(r'\s*[-|–—]\s*.*$', '', title)
        title = re.sub(r'\s*[|｜]\s*.*$', '', title)
        if title:
            return title

    # Try og:site_name
    og_match = re.search(r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)["\']', html, re.IGNORECASE)
    if og_match:
        return og_match.group(1).strip()

    # Fall back to domain
    from urllib.parse import urlparse
    parsed = urlparse(url)
    return parsed.netloc


def find_friend_links_page(html: str, base_url: str) -> Optional[str]:
    """Try to find the friend links page URL."""
    from urllib.parse import urljoin

    # Common friend link page paths
    friend_patterns = [
        r'href=["\']([^"\']*(?:friend|link|友链|友情链接|links)[^"\']*)["\']',
        r'href=["\']([^"\']*/(?:friend|link|links|blogroll)[^"\']*)["\']',
    ]

    for pattern in friend_patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        for match in matches:
            if match and not match.startswith(('#', 'javascript:')):
                return urljoin(base_url, match)

    return None


def extract_friend_links(html: str, base_url: str) -> list:
    """Extract friend blog links from a page."""
    from urllib.parse import urljoin, urlparse
    from utils import is_likely_blog_url

    links = []

    # Find all links
    href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)

    # Look for friend link sections
    # Common class names: friend, link, blogroll, 友链
    friend_section_pattern = re.compile(
        r'<(?:div|section|ul|ol)[^>]*(?:class|id)=["\'][^"\']*(?:friend|link|blogroll|友链|友情)[^"\']*["\'][^>]*>(.*?)</(?:div|section|ul|ol)>',
        re.IGNORECASE | re.DOTALL
    )

    sections = friend_section_pattern.findall(html)

    # If we found friend sections, extract links from them
    if sections:
        for section in sections:
            for match in href_pattern.finditer(section):
                href = match.group(1)
                if href.startswith(('#', 'javascript:', 'mailto:')):
                    continue
                absolute_url = urljoin(base_url, href)
                if is_likely_blog_url(absolute_url):
                    # Make sure it's external
                    parsed_base = urlparse(base_url)
                    parsed_link = urlparse(absolute_url)
                    if parsed_base.netloc != parsed_link.netloc:
                        links.append(absolute_url)
    else:
        # No explicit friend section found, try to find links in main content
        # Be more conservative here
        pass

    return list(set(links))
