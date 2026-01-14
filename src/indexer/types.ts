/**
 * Shared types for the indexer module.
 */

export interface Article {
  title: string;
  url: string;
  description: string;
  cover_image: string | null;
  language: string | null;
  published_at: string | null;
}

export interface Blog {
  id: number;
  url: string;
  name: string | null;
  ssg: string | null;
  comment_system: string | null;
  rss_url: string | null;
  languages: string[];
  last_scraped_at: string | null;
  error_count: number;
  last_error: string | null;
}

export interface CrawlState {
  current_blog_id: number | null;
  last_crawl_at: string | null;
  is_running: boolean;
}

export interface SeedSource {
  id?: number;
  url: string;
  name: string;
  type: "circle" | "webring" | "blogroll" | "directory";
  languages: string[];
  last_scraped_at?: string | null;
  member_count?: number;
}

export interface DiscoveryQueueItem {
  id?: number;
  url: string;
  discovered_from_blog_id: number | null;
  discovery_type: "friend_link" | "circle_member" | "webring";
  priority: number;
}
