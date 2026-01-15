import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createSchema } from "../../src/db";

/**
 * Tests for the crawl orchestrator that ties together:
 * - Protocol detection
 * - Site fingerprinting
 * - Friend link extraction
 * - Trust calculation
 * - Graph building
 */

describe("CrawlOrchestrator", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    createSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("processSite", () => {
    test("processes a site and stores fingerprint data", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Insert a test site
      db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", [
        "https://example-hexo.com",
        "Test Blog",
      ]);
      const siteId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://example-hexo.com"
      ) as { id: number };

      const orchestrator = new CrawlOrchestrator({ db });

      // Mock HTML response for a Hexo blog
      const mockHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="generator" content="Hexo 6.3.0">
          <link rel="alternate" type="application/rss+xml" href="/atom.xml">
        </head>
        <body class="theme-butterfly">
          <div class="friend-links">
            <a href="https://friend1.com">Friend 1</a>
            <a href="https://friend2.com">Friend 2</a>
          </div>
        </body>
        </html>
      `;

      const result = await orchestrator.processSite({
        siteId: siteId.id,
        url: "https://example-hexo.com",
        html: mockHtml,
      });

      expect(result.fingerprint.ssg).toBe("hexo");
      expect(result.fingerprint.theme).toBe("butterfly");
      expect(result.protocols.rss.supported).toBe(true);
      expect(result.friendLinks.length).toBe(2);
    });

    test("calculates trust from seed relationships", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Insert a seed site with trust 1.0
      db.run(
        "INSERT INTO blogs (url, name, trust_score, hop_count) VALUES (?, ?, ?, ?)",
        ["https://seed.com", "Seed Site", 1.0, 0]
      );
      const seedId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://seed.com"
      ) as { id: number };

      // Insert target site
      db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", [
        "https://discovered.com",
        "Discovered Blog",
      ]);
      const targetId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://discovered.com"
      ) as { id: number };

      // Create relationship
      db.run(
        `INSERT INTO site_relationships
         (source_site_id, target_site_id, target_url, relationship_type, discovery_method, confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [seedId.id, targetId.id, "https://discovered.com", "friend_link", "opml", 0.9]
      );

      const orchestrator = new CrawlOrchestrator({ db });

      const trust = await orchestrator.calculateSiteTrust(targetId.id);

      // Trust should be: sourceTrust(1.0) * decay(0.8) * confidence(0.9) + method_bonus
      expect(trust.score).toBeGreaterThan(0.7);
      expect(trust.hopCount).toBe(1);
    });

    test("extracts and stores friend link relationships", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Insert source site
      db.run(
        "INSERT INTO blogs (url, name, trust_score, hop_count) VALUES (?, ?, ?, ?)",
        ["https://source.com", "Source Blog", 0.9, 1]
      );
      const sourceId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://source.com"
      ) as { id: number };

      const orchestrator = new CrawlOrchestrator({ db });

      const html = `
        <!DOCTYPE html>
        <html>
        <body>
          <div class="friend-links">
            <a href="https://friend1.com" rel="friend">Friend 1</a>
            <a href="https://friend2.com">Friend 2</a>
          </div>
        </body>
        </html>
      `;

      await orchestrator.processSite({
        siteId: sourceId.id,
        url: "https://source.com",
        html,
      });

      // Check relationships were stored
      const relationships = db
        .query(
          "SELECT * FROM site_relationships WHERE source_site_id = ?"
        )
        .all(sourceId.id) as Array<{
          target_url: string;
          relationship_type: string;
          discovery_method: string;
        }>;

      expect(relationships.length).toBe(2);
      expect(relationships.map((r) => r.target_url)).toContain(
        "https://friend1.com"
      );
      expect(relationships.map((r) => r.target_url)).toContain(
        "https://friend2.com"
      );
    });

    test("updates site fingerprint in database", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Insert site
      db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", [
        "https://hugo-blog.com",
        "Hugo Blog",
      ]);
      const siteId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://hugo-blog.com"
      ) as { id: number };

      const orchestrator = new CrawlOrchestrator({ db });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="generator" content="Hugo 0.120">
        </head>
        <body>
          <div id="disqus_thread"></div>
        </body>
        </html>
      `;

      await orchestrator.processSite({
        siteId: siteId.id,
        url: "https://hugo-blog.com",
        html,
      });

      // Check fingerprint was stored
      const site = db.query("SELECT * FROM blogs WHERE id = ?").get(
        siteId.id
      ) as { ssg: string; comment_system: string };

      expect(site.ssg).toBe("hugo");
      expect(site.comment_system).toBe("disqus");
    });

    test("detects and stores protocol support", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Insert site
      db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", [
        "https://protocol-blog.com",
        "Protocol Blog",
      ]);
      const siteId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://protocol-blog.com"
      ) as { id: number };

      const orchestrator = new CrawlOrchestrator({ db });

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <link rel="alternate" type="application/rss+xml" href="/feed.xml">
          <link rel="webmention" href="https://webmention.io/protocol-blog.com/webmention">
        </head>
        <body>
          <a href="/blogroll.opml" type="text/x-opml">Blogroll</a>
        </body>
        </html>
      `;

      await orchestrator.processSite({
        siteId: siteId.id,
        url: "https://protocol-blog.com",
        html,
      });

      // Check protocols were stored
      const site = db.query("SELECT * FROM blogs WHERE id = ?").get(
        siteId.id
      ) as {
        rss_url: string;
        has_opml: number;
        opml_url: string;
        has_webmention: number;
        webmention_endpoint: string;
      };

      expect(site.rss_url).toBe("https://protocol-blog.com/feed.xml");
      expect(site.has_opml).toBe(1);
      expect(site.opml_url).toBe("https://protocol-blog.com/blogroll.opml");
      expect(site.has_webmention).toBe(1);
      expect(site.webmention_endpoint).toBe(
        "https://webmention.io/protocol-blog.com/webmention"
      );
    });
  });

  describe("processDiscoveredSites", () => {
    test("creates new sites for undiscovered friend links", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Insert source site
      db.run(
        "INSERT INTO blogs (url, name, trust_score, hop_count) VALUES (?, ?, ?, ?)",
        ["https://source.com", "Source", 0.9, 1]
      );
      const sourceId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://source.com"
      ) as { id: number };

      const orchestrator = new CrawlOrchestrator({ db });

      // Process new friend links
      await orchestrator.processDiscoveredSites([
        {
          url: "https://newfriend.com",
          name: "New Friend",
          discoveryMethod: "heuristic",
          confidence: 0.6,
        },
      ], sourceId.id);

      // Check new site was created
      const newSite = db.query("SELECT * FROM blogs WHERE url = ?").get(
        "https://newfriend.com"
      ) as { id: number; name: string };

      expect(newSite).toBeTruthy();
      expect(newSite.name).toBe("New Friend");

      // Check relationship was created
      const rel = db
        .query(
          "SELECT * FROM site_relationships WHERE source_site_id = ? AND target_url = ?"
        )
        .get(sourceId.id, "https://newfriend.com") as {
          target_site_id: number;
          discovery_method: string;
        };

      expect(rel).toBeTruthy();
      expect(rel.target_site_id).toBe(newSite.id);
      expect(rel.discovery_method).toBe("heuristic");
    });

    test("updates existing relationships for known sites", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Insert source and target sites
      db.run(
        "INSERT INTO blogs (url, name, trust_score, hop_count) VALUES (?, ?, ?, ?)",
        ["https://source.com", "Source", 0.9, 1]
      );
      db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", [
        "https://existing.com",
        "Existing",
      ]);

      const sourceId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://source.com"
      ) as { id: number };
      const existingId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://existing.com"
      ) as { id: number };

      // Create initial relationship
      db.run(
        `INSERT INTO site_relationships
         (source_site_id, target_site_id, target_url, relationship_type, discovery_method, confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sourceId.id, existingId.id, "https://existing.com", "friend_link", "heuristic", 0.5]
      );

      const orchestrator = new CrawlOrchestrator({ db });

      // Process with higher confidence
      await orchestrator.processDiscoveredSites([
        {
          url: "https://existing.com",
          name: "Existing",
          discoveryMethod: "opml",
          confidence: 0.95,
        },
      ], sourceId.id);

      // Check relationship was updated
      const rel = db
        .query(
          "SELECT * FROM site_relationships WHERE source_site_id = ? AND target_url = ?"
        )
        .get(sourceId.id, "https://existing.com") as {
          confidence: number;
          discovery_method: string;
        };

      expect(rel.confidence).toBe(0.95);
      expect(rel.discovery_method).toBe("opml");
    });
  });

  describe("buildTrustGraph", () => {
    test("propagates trust through the graph", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Create a chain: seed -> site1 -> site2
      db.run(
        "INSERT INTO blogs (url, name, trust_score, hop_count) VALUES (?, ?, ?, ?)",
        ["https://seed.com", "Seed", 1.0, 0]
      );
      db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", [
        "https://site1.com",
        "Site 1",
      ]);
      db.run("INSERT INTO blogs (url, name) VALUES (?, ?)", [
        "https://site2.com",
        "Site 2",
      ]);

      const seedId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://seed.com"
      ) as { id: number };
      const site1Id = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://site1.com"
      ) as { id: number };
      const site2Id = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://site2.com"
      ) as { id: number };

      // Create relationships
      db.run(
        `INSERT INTO site_relationships
         (source_site_id, target_site_id, target_url, relationship_type, discovery_method, confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [seedId.id, site1Id.id, "https://site1.com", "friend_link", "opml", 0.9]
      );
      db.run(
        `INSERT INTO site_relationships
         (source_site_id, target_site_id, target_url, relationship_type, discovery_method, confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [site1Id.id, site2Id.id, "https://site2.com", "friend_link", "heuristic", 0.7]
      );

      const orchestrator = new CrawlOrchestrator({ db });

      await orchestrator.buildTrustGraph();

      // Check trust propagated
      const site1 = db.query("SELECT * FROM blogs WHERE id = ?").get(
        site1Id.id
      ) as { trust_score: number; hop_count: number };
      const site2 = db.query("SELECT * FROM blogs WHERE id = ?").get(
        site2Id.id
      ) as { trust_score: number; hop_count: number };

      expect(site1.trust_score).toBeGreaterThan(0.7); // 1.0 * 0.8 * 1.0 = 0.8
      expect(site1.hop_count).toBe(1);

      expect(site2.trust_score).toBeGreaterThan(0); // site1.trust * 0.8 * 0.7
      expect(site2.trust_score).toBeLessThan(site1.trust_score);
      expect(site2.hop_count).toBe(2);
    });

    test("identifies derived seed candidates", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Create high-trust site with OPML and many friend links
      db.run(
        `INSERT INTO blogs
         (url, name, trust_score, hop_count, has_opml, opml_url)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["https://highquality.com", "High Quality", 0.85, 1, 1, "/blogroll.opml"]
      );

      const siteId = db.query("SELECT id FROM blogs WHERE url = ?").get(
        "https://highquality.com"
      ) as { id: number };

      // Add 15 friend link relationships
      for (let i = 0; i < 15; i++) {
        db.run(
          `INSERT INTO site_relationships
           (source_site_id, target_url, relationship_type, discovery_method, confidence)
           VALUES (?, ?, ?, ?, ?)`,
          [siteId.id, `https://friend${i}.com`, "friend_link", "opml", 0.9]
        );
      }

      const orchestrator = new CrawlOrchestrator({ db });

      const candidates = await orchestrator.findDerivedSeedCandidates();

      expect(candidates.length).toBe(1);
      expect(candidates[0].url).toBe("https://highquality.com");
    });
  });

  describe("getGraphStats", () => {
    test("returns accurate graph statistics", async () => {
      const { CrawlOrchestrator } = await import(
        "../../src/indexer/crawl-orchestrator"
      );

      // Create some sites and relationships
      db.run(
        "INSERT INTO blogs (url, name, trust_score, hop_count, ssg) VALUES (?, ?, ?, ?, ?)",
        ["https://site1.com", "Site 1", 0.9, 0, "hexo"]
      );
      db.run(
        "INSERT INTO blogs (url, name, trust_score, hop_count, ssg) VALUES (?, ?, ?, ?, ?)",
        ["https://site2.com", "Site 2", 0.7, 1, "hugo"]
      );
      db.run(
        "INSERT INTO blogs (url, name, trust_score, hop_count, ssg) VALUES (?, ?, ?, ?, ?)",
        ["https://site3.com", "Site 3", 0.5, 2, null]
      );

      db.run(
        `INSERT INTO site_relationships
         (source_site_id, target_url, relationship_type, discovery_method, confidence)
         VALUES (?, ?, ?, ?, ?)`,
        [1, "https://site2.com", "friend_link", "opml", 0.9]
      );
      db.run(
        `INSERT INTO site_relationships
         (source_site_id, target_url, relationship_type, discovery_method, confidence)
         VALUES (?, ?, ?, ?, ?)`,
        [2, "https://site3.com", "friend_link", "heuristic", 0.6]
      );

      const orchestrator = new CrawlOrchestrator({ db });

      const stats = await orchestrator.getGraphStats();

      expect(stats.totalSites).toBe(3);
      expect(stats.totalRelationships).toBe(2);
      expect(stats.fingerprintedSites).toBe(2); // 2 with SSG detected
      expect(stats.avgTrustScore).toBeCloseTo((0.9 + 0.7 + 0.5) / 3, 2);
    });
  });
});
