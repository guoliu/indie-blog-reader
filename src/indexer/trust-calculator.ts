/**
 * Trust score calculation for sites in the graph
 *
 * Trust is propagated from seed sources through the relationship graph:
 * - Root seeds have trust = 1.0
 * - Trust decays with each hop (TRUST_DECAY_FACTOR)
 * - Content quality signals can boost or penalize
 * - High-trust sites with OPML can become derived seeds
 */

// ============================================================================
// Constants
// ============================================================================

/** Trust decay factor per hop (0.8 = 20% decay per hop) */
export const TRUST_DECAY_FACTOR = 0.8;

/** Minimum trust for sites with no incoming relationships */
export const MINIMUM_TRUST = 0.1;

/** Trust threshold for promoting to derived seed */
export const DERIVED_SEED_TRUST_THRESHOLD = 0.8;

/** Minimum friend links required for derived seed promotion */
export const DERIVED_SEED_MIN_FRIEND_LINKS = 10;

/** Minimum content quality modifier (floor) */
export const MIN_QUALITY_MODIFIER = 0.3;

/** Maximum content quality modifier (ceiling) */
export const MAX_QUALITY_MODIFIER = 1.2;

/** Confidence boost for protocol-based discovery methods */
const METHOD_CONFIDENCE_BONUS: Record<string, number> = {
  opml: 0.1,
  xfn: 0.05,
  microformat: 0.05,
  heuristic: 0,
};

// ============================================================================
// Types
// ============================================================================

export interface IncomingRelationship {
  sourceTrust: number;
  confidence: number;
  method: "opml" | "xfn" | "microformat" | "heuristic";
}

export interface HopRelationship {
  sourceHopCount: number;
}

export interface TrustInput {
  isRootSeed: boolean;
  incomingRelationships: IncomingRelationship[];
}

export interface HopInput {
  isRootSeed: boolean;
  incomingRelationships: HopRelationship[];
}

export interface ContentQualityInput {
  postsPerDay: number;
  hasAuthorInfo: boolean;
  hasOriginalDates: boolean;
}

export interface FinalTrustInput {
  isRootSeed: boolean;
  incomingRelationships: IncomingRelationship[];
  contentQuality: ContentQualityInput;
}

export interface DerivedSeedInput {
  trustScore: number;
  hasOpml: boolean;
  friendLinkCount: number;
}

// ============================================================================
// Trust Calculation
// ============================================================================

/**
 * Calculate trust score based on incoming relationships from seed sources
 */
export function calculateTrustFromSeeds(input: TrustInput): number {
  // Root seeds have full trust
  if (input.isRootSeed) {
    return 1.0;
  }

  // No relationships = minimum trust
  if (input.incomingRelationships.length === 0) {
    return MINIMUM_TRUST;
  }

  // Calculate trust from each relationship and take the maximum
  const trustValues = input.incomingRelationships.map((rel) => {
    const methodBonus = METHOD_CONFIDENCE_BONUS[rel.method] || 0;
    const effectiveConfidence = Math.min(1.0, rel.confidence + methodBonus);
    return rel.sourceTrust * TRUST_DECAY_FACTOR * effectiveConfidence;
  });

  return Math.max(...trustValues);
}

// ============================================================================
// Hop Count Calculation
// ============================================================================

/**
 * Calculate hop count (distance from nearest seed)
 */
export function calculateHopCount(input: HopInput): number | null {
  // Root seeds are at hop 0
  if (input.isRootSeed) {
    return 0;
  }

  // No relationships = unknown hop count
  if (input.incomingRelationships.length === 0) {
    return null;
  }

  // Find minimum hop count from sources and add 1
  const minSourceHop = Math.min(
    ...input.incomingRelationships.map((rel) => rel.sourceHopCount)
  );

  return minSourceHop + 1;
}

// ============================================================================
// Content Quality Assessment
// ============================================================================

/**
 * Assess content quality and return a modifier (0.3 to 1.2)
 *
 * Factors:
 * - Posting frequency (penalize excessive posting)
 * - Author info presence (slight penalty if missing)
 * - Original dates (boost if present)
 */
export function assessContentQuality(input: ContentQualityInput): number {
  let modifier = 1.0;

  // Penalize excessive posting (>10 posts/day is suspicious)
  if (input.postsPerDay > 10) {
    // Scale penalty based on how excessive
    const excessFactor = Math.min(input.postsPerDay / 10, 10);
    modifier *= 1 / excessFactor;
  }

  // Slight penalty for missing author info
  if (!input.hasAuthorInfo) {
    modifier *= 0.95;
  }

  // Slight boost for original dates (indicates quality metadata)
  if (input.hasOriginalDates) {
    modifier *= 1.02;
  }

  // Clamp to reasonable range
  return Math.max(MIN_QUALITY_MODIFIER, Math.min(MAX_QUALITY_MODIFIER, modifier));
}

// ============================================================================
// Final Trust Calculation
// ============================================================================

/**
 * Calculate final trust score combining seed trust with content quality
 */
export function calculateFinalTrust(input: FinalTrustInput): number {
  const baseTrust = calculateTrustFromSeeds({
    isRootSeed: input.isRootSeed,
    incomingRelationships: input.incomingRelationships,
  });

  const qualityModifier = assessContentQuality(input.contentQuality);

  // Combine and clamp to 0-1 range
  const finalTrust = baseTrust * qualityModifier;
  return Math.max(0, Math.min(1.0, finalTrust));
}

// ============================================================================
// Derived Seed Promotion
// ============================================================================

/**
 * Determine if a site should be promoted to a derived seed
 *
 * Criteria (all must be met):
 * - Trust score >= 0.8
 * - Has OPML blogroll (machine-readable)
 * - Has 10+ valid friend links
 */
export function shouldPromoteToDerivedSeed(input: DerivedSeedInput): boolean {
  return (
    input.trustScore >= DERIVED_SEED_TRUST_THRESHOLD &&
    input.hasOpml &&
    input.friendLinkCount >= DERIVED_SEED_MIN_FRIEND_LINKS
  );
}
