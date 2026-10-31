import type { IEvaluation } from '@genfeedai/client/models';
import type { ComponentSize, IngredientCategory } from '@genfeedai/contracts';

export interface EvaluationCardProps {
  contentId: string;
  contentType: IngredientCategory | 'article' | 'post';
  evaluation?: IEvaluation;
  onEvaluate: () => Promise<void>;
  isEvaluating?: boolean;
  isPublished?: boolean;
  /** `embedded` renders one compact row with expandable details, no Card. */
  variant?: 'card' | 'embedded';
}

export interface EvaluationBadgeProps {
  score: number;
  size?: ComponentSize.XS | ComponentSize.SM | ComponentSize.MD;
  showLabel?: boolean;
}
