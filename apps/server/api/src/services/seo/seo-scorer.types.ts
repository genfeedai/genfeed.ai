/**
 * SEO scorer types for the API.
 *
 * The core scorecard contract is canonical in `@genfeedai/contracts/interfaces`
 * (`content/seo-scorecard.interface.ts`) and re-exported here so the scorer
 * service/util keep a single local import surface. Only the API-internal
 * scoring types (input shape, LLM sub-scores, options) are defined here.
 */

export type {
  SeoCheck,
  SeoCheckKind,
  SeoDimension,
  SeoRating,
  SeoScorecard,
  SeoScorecardMeta,
} from '@genfeedai/contracts/interfaces';
export {
  SEO_DIMENSION_MAX,
  SEO_DIMENSIONS,
} from '@genfeedai/contracts/interfaces';

/**
 * Normalised, source-agnostic content the scorer operates on. Decoupled from
 * the Article/Post DB shape so the deterministic core is trivially testable.
 */
export interface SeoScorableContent {
  /** Page title / H1 (Article.label, Post.label). */
  title?: string | null;
  /** Meta description / excerpt (Article.summary). */
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
