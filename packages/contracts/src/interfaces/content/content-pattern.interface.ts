import type {
  ContentPatternCategory,
  ContentPatternType,
} from '../../enums/content-intelligence.enum';

/**
 * The two closed labels of one extracted content pattern (#4868).
 *
 * Both are decided together from the post, so they travel together: a pattern
 * whose labels no confident source produced is persisted as uncertain rather
 * than silently coerced onto a plausible default.
 */
export interface ContentPatternLabels {
  /**
   * No above-threshold decision and no rule-based match produced these
   * labels, so at least one of them is a placeholder. Consumers filter on it.
   */
  isLowConfidence: boolean;
  patternType: ContentPatternType;
  templateCategory?: ContentPatternCategory;
}
