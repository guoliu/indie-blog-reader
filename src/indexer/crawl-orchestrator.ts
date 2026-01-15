/**
 * Crawl Orchestrator - ties together all crawl components
 *
 * Coordinates:
 * - Protocol detection
 * - Site fingerprinting
 * - Friend link extraction
 * - Trust calculation
 * - Graph building
 */

import { Database } from "bun:sqlite";
import { detectAllProtocols, type AllProtocolsResult } from "./protocol-detector";
import { fingerprint, type SiteFingerprint } from "./fingerprinter";
import { extractFriendLinks, type FriendLink } from "./friend-link-extractor";
import {
  calculateTrustFromSeeds,
  calculateHopCount,
  shouldPromoteToDerivedSeed,
  TRUST_DECAY_FACTOR,
  MINIMUM_TRUST,
  type IncomingRelationship,
  type HopRelationship,
} from "./trust-calculator";

// ============================================================================
// Types
// ============================================================================

export interface OrchestratorConfig {
  db: Database;
}

export interface ProcessSiteInput {
  siteId: number;
  url: string;
  html: string;
}

export interface ProcessSiteResult {
  fingerprint: SiteFingerprint;
  protocols: AllProtocolsResult;
  friendLinks: FriendLink[];
}

export interface TrustResult {
  score: number;
  hopCount: number | null;
}

export interface DiscoveredSite {
  url: string;
  name?: string;
  discoveryMethod: "opml" | "xfn" | "microformat" | "heuristic";
  confidence: number;
}

export interface DerivedSeedCandidate {
  id: number;
  url: string;
  name: string | null;
  trustScore: number;
  friendLinkCount: number;
}

export interface GraphStats {
  totalSites: number;
  totalRelationships: number;
  fingerprintedSites: number;
  avgTrustScore: number;
}

// ============================================================================
// Crawl Orchestrator
// ============================================================================

export class CrawlOrchestrator {
  private db: Database;

  constructor(config: OrchestratorConfig) {
    this.db = config.db;
  }

  /**
   * Process a site: detect protocols, fingerprint, extract friend links
   */
  async processSite(input: ProcessSiteInput): Promise<ProcessSiteResult> {
    const { siteId, url, html } = input;

    // 1. Detect protocols
    const protocols = detectAllProtocols(html, url);

    // 2. Fingerprint the site
    const fp = fingerprint(html);

    // 3. Extract friend links
    const friendLinks = await extractFriendLinks({ html, url });

    // 4. Update database with fingerprint
    this.db.run(
      `UPDATE blogs SET
        ssg = ?,
        theme = ?,
        comment_system = ?,
        rss_url = ?,
        has_opml = ?,
        opml_url = ?,
        has_webmention = ?,
        webmention_endpoint = ?,
        has_microformats = ?
      WHERE id = ?`,
      [
        fp.ssg,
        fp.theme,
        fp.commentSystem,
        protocols.rss.url || null,
        protocols.opml.supported ? 1 : 0,
        protocols.opml.url || null,
        protocols.webmention.supported ? 1 : 0,
        protocols.webmention.endpoint || null,
        protocols.microformats.hCard || protocols.microformats.hFeed ? 1 : 0,
        siteId,
      ]
    );

    // 5. Store friend link relationships
    await this.processDiscoveredSites(friendLinks, siteId);

    return {
      fingerprint: fp,
      protocols,
      friendLinks,
    };
  }

  /**
   * Calculate trust score for a site based on incoming relationships
   */
  async calculateSiteTrust(siteId: number): Promise<TrustResult> {
    // Get site info
    const site = this.db.query("SELECT url FROM blogs WHERE id = ?").get(
      siteId
    ) as { url: string } | null;

    if (!site) {
      return { score: MINIMUM_TRUST, hopCount: null };
    }

    // Check if this is a root seed
    const isRootSeed = this.db
      .query("SELECT 1 FROM seed_sources WHERE url = ? AND type = 'root_seed'")
      .get(site.url);

    if (isRootSeed) {
      return { score: 1.0, hopCount: 0 };
    }

    // Get incoming relationships
    const relationships = this.db
      .query(
        `SELECT
          b.trust_score as sourceTrust,
          b.hop_count as sourceHopCount,
          r.confidence,
          r.discovery_method as method
        FROM site_relationships r
        JOIN blogs b ON b.id = r.source_site_id
        WHERE r.target_site_id = ?`
      )
      .all(siteId) as Array<{
        sourceTrust: number;
        sourceHopCount: number | null;
        confidence: number;
        method: string;
      }>;

    const incomingForTrust: IncomingRelationship[] = relationships
      .filter((r) => r.sourceTrust !== null)
      .map((r) => ({
        sourceTrust: r.sourceTrust,
        confidence: r.confidence,
        method: r.method as "opml" | "xfn" | "microformat" | "heuristic",
      }));

    const incomingForHops: HopRelationship[] = relationships
      .filter((r) => r.sourceHopCount !== null)
      .map((r) => ({
        sourceHopCount: r.sourceHopCount!,
      }));

    const score = calculateTrustFromSeeds({
      isRootSeed: false,
      incomingRelationships: incomingForTrust,
    });

    const hopCount = calculateHopCount({
      isRootSeed: false,
      incomingRelationships: incomingForHops,
    });

    return { score, hopCount };
  }

  /**
   * Process discovered sites (friend links) and store relationships
   */
  async processDiscoveredSites(
    sites: DiscoveredSite[],
    sourceSiteId: number
  ): Promise<void> {
    for (const site of sites) {
      // Check if target site exists
      let targetSite = this.db
        .query("SELECT id FROM blogs WHERE url = ?")
        .get(site.url) as { id: number } | null;

      // Create new site if not exists
      if (!targetSite) {
        this.db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", [
          site.url,
          site.name || null,
        ]);
        targetSite = this.db
          .query("SELECT id FROM blogs WHERE url = ?")
          .get(site.url) as { id: number };
      }

      // Upsert relationship
      this.db.run(
        `INSERT INTO site_relationships
          (source_site_id, target_site_id, target_url, relationship_type, discovery_method, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_site_id, target_url, relationship_type) DO UPDATE SET
          target_site_id = excluded.target_site_id,
          discovery_method = excluded.discovery_method,
          confidence = excluded.confidence,
          last_seen_at = unixepoch()`,
        [
          sourceSiteId,
          targetSite.id,
          site.url,
          "friend_link",
          site.discoveryMethod,
          site.confidence,
        ]
      );
    }
  }

  /**
   * Build/update trust graph by propagating trust from seeds
   */
  async buildTrustGraph(): Promise<void> {
    // Process in order of hop count (BFS from seeds)
    // First, mark root seeds
    this.db.run(`
      UPDATE blogs
      SET trust_score = 1.0, hop_count = 0
      WHERE url IN (SELECT url FROM seed_sources WHERE type = 'root_seed')
    `);

    // Iteratively propagate trust (up to reasonable depth)
    const maxHops = 10;
    for (let hop = 1; hop <= maxHops; hop++) {
      // Find sites that can be reached from sites at hop-1
      const sitesToUpdate = this.db
        .query(
          `SELECT DISTINCT r.target_site_id as id
          FROM site_relationships r
          JOIN blogs source ON source.id = r.source_site_id
          WHERE source.hop_count = ?
            AND r.target_site_id IS NOT NULL
            AND (SELECT hop_count FROM blogs WHERE id = r.target_site_id) IS NULL`
        )
        .all(hop - 1) as Array<{ id: number }>;

      if (sitesToUpdate.length === 0) break;

      for (const site of sitesToUpdate) {
        const trust = await this.calculateSiteTrust(site.id);
        this.db.run(
          "UPDATE blogs SET trust_score = ?, hop_count = ? WHERE id = ?",
          [trust.score, trust.hopCount, site.id]
        );
      }
    }
  }

  /**
   * Find sites that qualify as derived seeds
   */
  async findDerivedSeedCandidates(): Promise<DerivedSeedCandidate[]> {
    // Use subquery for the count condition since we can't use HAVING without GROUP BY
    const candidates = this.db
      .query(
        `SELECT
          b.id,
          b.url,
          b.name,
          b.trust_score as trustScore,
          (SELECT COUNT(*) FROM site_relationships WHERE source_site_id = b.id) as friendLinkCount
        FROM blogs b
        WHERE b.has_opml = 1
          AND b.trust_score >= 0.8
          AND (SELECT COUNT(*) FROM site_relationships WHERE source_site_id = b.id) >= 10`
      )
      .all() as DerivedSeedCandidate[];

    return candidates.filter((c) =>
      shouldPromoteToDerivedSeed({
        trustScore: c.trustScore,
        hasOpml: true,
        friendLinkCount: c.friendLinkCount,
      })
    );
  }

  /**
   * Get statistics about the graph
   */
  async getGraphStats(): Promise<GraphStats> {
    const totalSites = (
      this.db.query("SELECT COUNT(*) as count FROM blogs").get() as {
        count: number;
      }
    ).count;

    const totalRelationships = (
      this.db.query("SELECT COUNT(*) as count FROM site_relationships").get() as {
        count: number;
      }
    ).count;

    const fingerprintedSites = (
      this.db
        .query("SELECT COUNT(*) as count FROM blogs WHERE ssg IS NOT NULL")
        .get() as { count: number }
    ).count;

    const avgResult = this.db
      .query("SELECT AVG(trust_score) as avg FROM blogs")
      .get() as { avg: number | null };

    return {
      totalSites,
      totalRelationships,
      fingerprintedSites,
      avgTrustScore: avgResult.avg || 0,
    };
  }
}
