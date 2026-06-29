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

export const SEO_DIMENSION_MAX: Record<SeoDimension, number> = {
  contentStructure: 20,
  keywordPlacement: 20,
  links: 10,
  media: 10,
  metaOptimization: 15,
  readability: 15,
  technicalSignals: 10,
};

export type SeoCheckKind = 'deterministic' | 'qualitative';

export interface SeoCheck {
  id: string;
  dimension: SeoDimension;
  label: string;
  kind: SeoCheckKind;
  max: number;
  points: number;
  available: boolean;
  note: string;
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
  keywordDensity: number | null;
  llmApplied: boolean;
  maxAvailable: number;
  scoredAt: string;
}

export interface SeoScorecard {
  score: number;
  rating: SeoRating;
  breakdown: Record<SeoDimension, number>;
  suggestions: string[];
  checks: SeoCheck[];
  meta: SeoScorecardMeta;
}

export type SeoScorecardSnapshot = Omit<SeoScorecard, 'score'> & {
  score?: number;
};

export interface ScoreSeoRequest {
  targetKeyword?: string;
}
