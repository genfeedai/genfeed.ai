import type { ICreativePattern, PatternType } from '@genfeedai/interfaces';

export interface PatternCardProps {
  pattern: ICreativePattern;
}

export interface UsePatternButtonProps {
  pattern: ICreativePattern;
}

export interface PatternLabFilters {
  platform?: string;
  patternType?: string;
  scope?: string;
}

export interface PatternLabPageProps {
  className?: string;
}

export interface ScoreBarProps {
  score: number;
}

export type PatternTypeBadgeVariant =
  | 'blue'
  | 'success'
  | 'amber'
  | 'accent'
  | 'multimodal';

export type PatternTypeVariantMap = Record<
  PatternType,
  PatternTypeBadgeVariant
>;
