/**
 * Canonical SEO scorer contract (#758).
 *
 * Mirrors the 7-dimension, 100-point rubric defined in
 * `skills/content-seo-optimizer/SKILL.md`. The scorer mixes deterministic
 * checks (computed in code, fully reproducible) with LLM qualitative
 * sub-scores for the criteria that cannot be derived from the content alone.
 */

export const SEO_DIMENSIONS = [
  'keywordPlacement',
  'contentStructure',
  'readability',
  'metaOptimization',
  'links',
  'media',
  'technicalSignals',
] as const;

export type SeoDimension = (typeof SEO_DIMENSIONS)[number];

/** Per-dimension maximum points — sums to 100. */
export const SEO_DIMENSION_MAX: Record<SeoDimension, number> = {
  contentStructure: 20,
  keywordPlacement: 20,
  links: 10,
  media: 10,
  metaOptimization: 15,
  readability: 15,
  technicalSignals: 10,
};

/**
 * `deterministic` checks are computed purely in code (same input → same
 * points). `qualitative` checks carry a deterministic heuristic baseline but
 * may be refined by the LLM layer.
 */
export type SeoCheckKind = 'deterministic' | 'qualitative';

export interface SeoCheck {
  /** Stable identifier (e.g. `kw_in_title`). */
  id: string;
  dimension: SeoDimension;
  label: string;
  kind: SeoCheckKind;
  /** Maximum points this check contributes to its dimension. */
  max: number;
  /** Points earned (0..max). */
  points: number;
  /**
   * `false` when the signal cannot be derived from the supplied input (e.g.
   * canonical/OG tags live in <head>, page-speed needs a render environment).
   * Unavailable checks still count 0 toward the raw score but are surfaced so
   * the caller can renormalise against `maxAvailable`.
   */
  available: boolean;
  /** Actionable, human-readable finding used to build suggestions. */
  note: string;
}

/**
 * Normalised, source-agnostic content the scorer operates on. Decoupled from
 * the Article/Post DB shape so the deterministic core is trivially testable.
 */
export interface SeoScorableContent {
  /** Page title / H1 (Article.title, Post.label). */
  title?: string | null;
  /** Meta description / excerpt (Article.excerpt). */
  metaDescription?: string | null;
  /** URL slug. */
  slug?: string | null;
  /** Body, stored as HTML in this codebase. */
  content?: string | null;
  /** Full page URL — only used for HTTPS / technical signals. */
  url?: string | null;
  /** Primary keyword to audit placement against. */
  targetKeyword?: string | null;
  /** Supporting keywords audited in subheadings. */
  secondaryKeywords?: string[];
}

export type SeoRating =
  | 'excellent'
  | 'good'
  | 'needs_work'
  | 'poor'
  | 'critical';

export interface SeoScorecardMeta {
  wordCount: number;
  fleschReadingEase: number;
  targetKeyword: string | null;
  /**
   * Word-coverage density: (occurrences × phrase_word_count) / total_words ×
   * 100, or null when no keyword given.
   */
  keywordDensity: number | null;
  /** Whether the LLM qualitative layer was applied. */
  llmApplied: boolean;
  /** Sum of `max` across available checks (for UI renormalisation). */
  maxAvailable: number;
  scoredAt: string;
}

export interface SeoScorecard {
  /** Overall 0-100 score (sum of all checks, rounded). */
  score: number;
  rating: SeoRating;
  /** Earned points per dimension. */
  breakdown: Record<SeoDimension, number>;
  /** Prioritised, actionable improvement suggestions. */
  suggestions: string[];
  /** Per-check detail (deterministic + qualitative). */
  checks: SeoCheck[];
  meta: SeoScorecardMeta;
}

/** Qualitative sub-scores returned by the LLM layer (each 0..check max). */
export interface SeoQualitativeLlmResult {
  faqPoints?: number;
  conclusionCtaPoints?: number;
  activeVoicePoints?: number;
  jargonPoints?: number;
  suggestions?: string[];
}

export interface ScoreContentOptions {
  /** Set `false` to skip the LLM layer (deterministic-only). Defaults to true. */
  useLlm?: boolean;
}

export type SeoScorableType = 'article' | 'post';
