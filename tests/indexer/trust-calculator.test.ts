import { describe, test, expect } from "bun:test";

/**
 * Tests for trust score calculation
 *
 * Trust is propagated from seed sources through the relationship graph.
 * - Root seeds have trust = 1.0
 * - Trust decays with each hop
 * - Content quality signals can boost or penalize
 */
describe("TrustCalculator", () => {
  describe("calculateTrustFromSeeds", () => {
    test("root seeds have trust score of 1.0", async () => {
      const { calculateTrustFromSeeds } = await import(
        "../../src/indexer/trust-calculator"
      );

      const trust = calculateTrustFromSeeds({
        isRootSeed: true,
        incomingRelationships: [],
      });

      expect(trust).toBe(1.0);
    });

    test("derived seeds have trust based on source", async () => {
      const { calculateTrustFromSeeds, TRUST_DECAY_FACTOR } = await import(
        "../../src/indexer/trust-calculator"
      );

      // Use heuristic method (no confidence bonus) for base formula test
      const trust = calculateTrustFromSeeds({
        isRootSeed: false,
        incomingRelationships: [
          {
            sourceTrust: 1.0,
            confidence: 0.9,
            method: "heuristic",
          },
        ],
      });

      // Trust should be: sourceTrust * DECAY_FACTOR * confidence
      expect(trust).toBeCloseTo(1.0 * TRUST_DECAY_FACTOR * 0.9, 2);
    });

    test("uses highest trust from multiple incoming relationships", async () => {
      const { calculateTrustFromSeeds } = await import(
        "../../src/indexer/trust-calculator"
      );

      const trust = calculateTrustFromSeeds({
        isRootSeed: false,
        incomingRelationships: [
          { sourceTrust: 0.5, confidence: 0.9, method: "xfn" },
          { sourceTrust: 0.9, confidence: 0.9, method: "opml" }, // Higher
          { sourceTrust: 0.3, confidence: 0.7, method: "heuristic" },
        ],
      });

      // Should use the highest (0.9 * decay * 0.9)
      expect(trust).toBeGreaterThan(0.5);
    });

    test("sites with no relationships have minimum trust", async () => {
      const { calculateTrustFromSeeds, MINIMUM_TRUST } = await import(
        "../../src/indexer/trust-calculator"
      );

      const trust = calculateTrustFromSeeds({
        isRootSeed: false,
        incomingRelationships: [],
      });

      expect(trust).toBe(MINIMUM_TRUST);
    });

    test("protocol-based discoveries get confidence boost", async () => {
      const { calculateTrustFromSeeds } = await import(
        "../../src/indexer/trust-calculator"
      );

      const protocolTrust = calculateTrustFromSeeds({
        isRootSeed: false,
        incomingRelationships: [
          { sourceTrust: 0.8, confidence: 0.8, method: "opml" },
        ],
      });

      const heuristicTrust = calculateTrustFromSeeds({
        isRootSeed: false,
        incomingRelationships: [
          { sourceTrust: 0.8, confidence: 0.8, method: "heuristic" },
        ],
      });

      // OPML should result in higher trust due to method bonus
      expect(protocolTrust).toBeGreaterThan(heuristicTrust);
    });
  });

  describe("calculateHopCount", () => {
    test("root seeds have hop count of 0", async () => {
      const { calculateHopCount } = await import(
        "../../src/indexer/trust-calculator"
      );

      const hops = calculateHopCount({
        isRootSeed: true,
        incomingRelationships: [],
      });

      expect(hops).toBe(0);
    });

    test("calculates minimum hop count from relationships", async () => {
      const { calculateHopCount } = await import(
        "../../src/indexer/trust-calculator"
      );

      const hops = calculateHopCount({
        isRootSeed: false,
        incomingRelationships: [
          { sourceHopCount: 1 },
          { sourceHopCount: 3 },
          { sourceHopCount: 2 },
        ],
      });

      // Should be min(1, 3, 2) + 1 = 2
      expect(hops).toBe(2);
    });

    test("sites with no relationships have null hop count", async () => {
      const { calculateHopCount } = await import(
        "../../src/indexer/trust-calculator"
      );

      const hops = calculateHopCount({
        isRootSeed: false,
        incomingRelationships: [],
      });

      expect(hops).toBeNull();
    });
  });

  describe("assessContentQuality", () => {
    test("returns 1.0 for normal content", async () => {
      const { assessContentQuality } = await import(
        "../../src/indexer/trust-calculator"
      );

      const modifier = assessContentQuality({
        postsPerDay: 0.5,
        hasAuthorInfo: true,
        hasOriginalDates: true,
      });

      expect(modifier).toBeCloseTo(1.0, 1);
    });

    test("penalizes excessive posting frequency", async () => {
      const { assessContentQuality } = await import(
        "../../src/indexer/trust-calculator"
      );

      const modifier = assessContentQuality({
        postsPerDay: 15, // Suspiciously high
        hasAuthorInfo: true,
        hasOriginalDates: true,
      });

      expect(modifier).toBeLessThan(1.0);
    });

    test("slightly penalizes missing author info", async () => {
      const { assessContentQuality } = await import(
        "../../src/indexer/trust-calculator"
      );

      const withAuthor = assessContentQuality({
        postsPerDay: 0.5,
        hasAuthorInfo: true,
        hasOriginalDates: true,
      });

      const withoutAuthor = assessContentQuality({
        postsPerDay: 0.5,
        hasAuthorInfo: false,
        hasOriginalDates: true,
      });

      expect(withoutAuthor).toBeLessThan(withAuthor);
    });

    test("boosts sites with original dates", async () => {
      const { assessContentQuality } = await import(
        "../../src/indexer/trust-calculator"
      );

      const withDates = assessContentQuality({
        postsPerDay: 0.5,
        hasAuthorInfo: true,
        hasOriginalDates: true,
      });

      const withoutDates = assessContentQuality({
        postsPerDay: 0.5,
        hasAuthorInfo: true,
        hasOriginalDates: false,
      });

      expect(withDates).toBeGreaterThanOrEqual(withoutDates);
    });

    test("clamps modifier to reasonable range", async () => {
      const { assessContentQuality, MIN_QUALITY_MODIFIER, MAX_QUALITY_MODIFIER } =
        await import("../../src/indexer/trust-calculator");

      // Extreme penalty case
      const lowModifier = assessContentQuality({
        postsPerDay: 100,
        hasAuthorInfo: false,
        hasOriginalDates: false,
      });

      // Extreme boost case (not realistic but tests clamping)
      const highModifier = assessContentQuality({
        postsPerDay: 0.1,
        hasAuthorInfo: true,
        hasOriginalDates: true,
      });

      expect(lowModifier).toBeGreaterThanOrEqual(MIN_QUALITY_MODIFIER);
      expect(highModifier).toBeLessThanOrEqual(MAX_QUALITY_MODIFIER);
    });
  });

  describe("calculateFinalTrust", () => {
    test("combines seed trust with content quality", async () => {
      const { calculateFinalTrust } = await import(
        "../../src/indexer/trust-calculator"
      );

      const trust = calculateFinalTrust({
        isRootSeed: false,
        incomingRelationships: [
          { sourceTrust: 0.8, confidence: 0.9, method: "opml" },
        ],
        contentQuality: {
          postsPerDay: 0.5,
          hasAuthorInfo: true,
          hasOriginalDates: true,
        },
      });

      // Should be base trust * content quality modifier
      expect(trust).toBeGreaterThan(0);
      expect(trust).toBeLessThanOrEqual(1.0);
    });

    test("clamps final trust to 0-1 range", async () => {
      const { calculateFinalTrust } = await import(
        "../../src/indexer/trust-calculator"
      );

      const trust = calculateFinalTrust({
        isRootSeed: true,
        incomingRelationships: [],
        contentQuality: {
          postsPerDay: 0.1,
          hasAuthorInfo: true,
          hasOriginalDates: true,
        },
      });

      expect(trust).toBeLessThanOrEqual(1.0);
      expect(trust).toBeGreaterThanOrEqual(0);
    });
  });

  describe("shouldPromoteToDerivedSeed", () => {
    test("promotes high-trust sites with OPML and many friend links", async () => {
      const { shouldPromoteToDerivedSeed } = await import(
        "../../src/indexer/trust-calculator"
      );

      const shouldPromote = shouldPromoteToDerivedSeed({
        trustScore: 0.85,
        hasOpml: true,
        friendLinkCount: 15,
      });

      expect(shouldPromote).toBe(true);
    });

    test("does not promote low-trust sites", async () => {
      const { shouldPromoteToDerivedSeed } = await import(
        "../../src/indexer/trust-calculator"
      );

      const shouldPromote = shouldPromoteToDerivedSeed({
        trustScore: 0.5, // Below threshold
        hasOpml: true,
        friendLinkCount: 15,
      });

      expect(shouldPromote).toBe(false);
    });

    test("does not promote sites without OPML", async () => {
      const { shouldPromoteToDerivedSeed } = await import(
        "../../src/indexer/trust-calculator"
      );

      const shouldPromote = shouldPromoteToDerivedSeed({
        trustScore: 0.9,
        hasOpml: false, // No OPML
        friendLinkCount: 15,
      });

      expect(shouldPromote).toBe(false);
    });

    test("does not promote sites with few friend links", async () => {
      const { shouldPromoteToDerivedSeed } = await import(
        "../../src/indexer/trust-calculator"
      );

      const shouldPromote = shouldPromoteToDerivedSeed({
        trustScore: 0.9,
        hasOpml: true,
        friendLinkCount: 5, // Below threshold
      });

      expect(shouldPromote).toBe(false);
    });
  });

  describe("constants", () => {
    test("exports configuration constants", async () => {
      const {
        TRUST_DECAY_FACTOR,
        MINIMUM_TRUST,
        DERIVED_SEED_TRUST_THRESHOLD,
        DERIVED_SEED_MIN_FRIEND_LINKS,
      } = await import("../../src/indexer/trust-calculator");

      expect(TRUST_DECAY_FACTOR).toBe(0.8);
      expect(MINIMUM_TRUST).toBe(0.1);
      expect(DERIVED_SEED_TRUST_THRESHOLD).toBe(0.8);
      expect(DERIVED_SEED_MIN_FRIEND_LINKS).toBe(10);
    });
  });
});
