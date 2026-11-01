import type {
  ICreativePattern,
  PatternType,
} from '@genfeedai/contracts/interfaces';

export interface PatternCardProps {
  pattern: ICreativePattern;
}

export interface UsePatternButtonProps {
  pattern: ICreativePattern;
}

export interface PatternLabFilters {
  platform?: string;
  patternType?: PatternType | '';
  scope?: string;
}

export interface PatternLabPageProps {
  className?: string;
}

export interface ScoreBarProps {
  score: number;
}

export type PatternTypeBadgeVariant =
  | 'default'
  | 'info'
  | 'success'
  | 'warning';

export type PatternTypeVariantMap = Record<
  PatternType,
  PatternTypeBadgeVariant
>;
