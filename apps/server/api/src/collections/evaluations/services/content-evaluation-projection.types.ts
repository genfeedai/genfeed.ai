import type { IEvaluation } from '@genfeedai/contracts/interfaces';

export interface EvaluationReadScope {
  readonly brandId?: string | null;
  readonly contentType?: 'image' | 'video' | 'post' | 'article';
}

export interface EvaluationReadTarget {
  readonly organizationId: string;
  readonly contentType: NonNullable<IEvaluation['contentType']>;
  readonly contentId: string;
  readonly brandId: string | null;
  readonly activeBrandId: string | null;
}

export type ProjectedEvaluationItem<T> = T & { evaluation: IEvaluation | null };
