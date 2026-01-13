# Scraping Issues Log

This document tracks issues encountered during scraping that may need manual intervention or improved detection logic.

## Circle Scraping Issues

### 十年之约 (foreverblog.cn)
- **Issue**: Member list page uses JavaScript rendering
- **Current workaround**: Only extracted 5 blogs from static HTML
- **Potential solution**: Use headless browser (Playwright/Puppeteer) or find API endpoint
- **Estimated members**: 1,855+ according to their site

### BlogsClub (blogsclub.org)
- **Issue**: Member data loaded via JavaScript with token authentication
- **Current workaround**: Only found 3 blogs from static HTML
- **Potential solution**: Find the API endpoint pattern

### 笔墨迹 (blogscn.fun)
- **Issue**: Uses random API endpoint, no full list available
- **Current workaround**: Called random endpoint 50 times to collect ~47 unique blogs
- **Potential solution**: Check if they have a GitHub repo or full member list

## Detection Issues

### SSG Detection
- Some blogs return `unknown` when they should be detected
- Need to add more patterns as we encounter them

### Comment System Detection
- `unknown` comment type means we detected comment section but couldn't identify system
- Need to add more patterns

### Friend Links Detection
- Sometimes detects CSS files as friend link pages
- Need better URL filtering for friend links

## Failed URLs (SSL/Connection Issues)

These URLs failed due to technical issues, not scraping logic:

| URL | Error | Notes |
|-----|-------|-------|
| foreverblog.cn | SSL handshake failure | Different from www.foreverblog.cn |
| dogecloud.com | Connection timeout | CDN service, not a blog |
| static.geetest.com | 403 Forbidden | Security service, not a blog |

## Non-Blog URLs in Queue

The following types of URLs were incorrectly added to the queue and should be filtered:
- CDN domains (bootcss.com, jsdelivr.net, etc.)
- Service domains (afdian.com, beian.miit.gov.cn, etc.)
- Analytics domains (busuanzi.ibruce.info, etc.)

**Status**: Updated `is_likely_blog_url()` to filter these out.

## Data Quality Issues (Post-Analysis)

### Non-Blog URLs in Dataset
Despite filtering, some non-blog URLs were scraped:
- afdian.com (crowdfunding platform)
- cdn.bootcss.com (CDN)
- weavatar.com (avatar service)
- wjx.cn (survey platform)

**Impact**: Small percentage of 6500+ blogs. Can filter out in post-processing.

### Character Encoding Issues
Some blog names show garbled characters (e.g., "å\x8f\x8bäºº" instead of "友人")
- Cause: Response encoding detection not always accurate
- Impact: Visual only, URLs are correct

### SSG Detection
Current detection rates:
- **Hexo**: 1,312 (most popular Chinese SSG)
- **WordPress**: 737
- **Typecho**: 460
- **Unknown**: 2,035 (31%) - need more patterns

## Todo

- [ ] Implement headless browser scraping for JS-rendered circle pages
- [ ] Find API endpoints for 十年之约 and BlogsClub
- [ ] Add more SSG detection patterns as discovered
- [ ] Review failed.txt periodically for patterns
- [ ] Post-process to filter obvious non-blogs from final dataset
- [ ] Improve character encoding detection
