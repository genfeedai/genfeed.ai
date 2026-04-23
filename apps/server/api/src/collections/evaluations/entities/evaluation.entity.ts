import {
  type EvaluationDocument,
  type IActualPerformance,
  type IEvaluationAnalysis,
  type IEvaluationFlags,
  type IExternalContent,
  type IScores,
} from '@api/collections/evaluations/schemas/evaluation.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { EvaluationType, IngredientCategory, Status } from '@genfeedai/enums';

export class EvaluationEntity extends BaseEntity implements EvaluationDocument {
  organizationId!: string;
  userId!: string;
  organization!: string;
  user!: string;
  brand?: string;

  contentId!: string | null;
  contentType!: IngredientCategory | 'article' | null;
  content?: string;
  data!: EvaluationDocument['data'];
  evaluationType!: EvaluationType | string;
  status!: Status | string;
  overallScore?: number;
  scores?: IScores;
  analysis?: IEvaluationAnalysis;
  flags?: IEvaluationFlags;
  externalContent?: IExternalContent;
  actualPerformance?: IActualPerformance;
}
