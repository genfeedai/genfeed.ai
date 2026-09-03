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
  declare public id: string;
  declare public organizationId: string;
  declare public userId: string;
  declare public contentType: IEvaluation['contentType'];
  declare public contentId: string | null;
  declare public data: IEvaluationData;
  declare public isDeleted: boolean;
  declare public createdAt: Date;
  declare public updatedAt: Date;

  constructor(data: Partial<IEvaluation> = {}) {
    Object.assign(this, data);
  }
}
