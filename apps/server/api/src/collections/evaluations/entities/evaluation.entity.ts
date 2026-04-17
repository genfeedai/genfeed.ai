import {
  Evaluation,
  type IActualPerformance,
  type IEvaluationAnalysis,
  type IEvaluationFlags,
  type IExternalContent,
  type IScores,
} from '@api/collections/evaluations/schemas/evaluation.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { EvaluationType, IngredientCategory, Status } from '@genfeedai/enums';

export class EvaluationEntity extends BaseEntity implements Evaluation {
  organization!: string;
  user!: string;
  brand!: string;

  contentType!: IngredientCategory | 'article';
  content!: string;
  evaluationType!: EvaluationType;
  status!: Status;
  overallScore?: number;
  scores?: IScores;
  analysis?: IEvaluationAnalysis;
  flags?: IEvaluationFlags;
  externalContent?: IExternalContent;
  actualPerformance?: IActualPerformance;
}
