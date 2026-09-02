import type {
  IEvaluation,
  IEvaluationData,
} from '@genfeedai/contracts/interfaces';

export type {
  IActualPerformance,
  IBrandScores,
  IEngagementScores,
  IEvaluation,
  IEvaluationAnalysis,
  IEvaluationData,
  IEvaluationFlags,
  IEvaluationReview,
  IEvaluationReviewerComment,
  IEvaluationScores,
  IExternalContentData,
  ITechnicalScores,
} from '@genfeedai/contracts/interfaces';

export class Evaluation implements IEvaluation {
  public declare id: string;
  public declare organizationId: string;
  public declare userId: string;
  public declare contentType: IEvaluation['contentType'];
  public declare contentId: string | null;
  public declare data: IEvaluationData;
  public declare isDeleted: boolean;
  public declare createdAt: Date;
  public declare updatedAt: Date;

  constructor(data: Partial<IEvaluation> = {}) {
    Object.assign(this, data);
  }
}
