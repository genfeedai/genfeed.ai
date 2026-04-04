import type { IEvaluation } from '@genfeedai/client/models';
import type { ComponentSize, IngredientCategory } from '@genfeedai/enums';

export interface EvaluationCardProps {
  contentId: string;
  contentType: IngredientCategory | 'article' | 'post';
  evaluation?: IEvaluation;
  onEvaluate: () => Promise<void>;
  isEvaluating?: boolean;
  isPublished?: boolean;
}

export interface EvaluationBadgeProps {
  score: number;
  size?: ComponentSize.XS | ComponentSize.SM | ComponentSize.MD;
  showLabel?: boolean;
}
