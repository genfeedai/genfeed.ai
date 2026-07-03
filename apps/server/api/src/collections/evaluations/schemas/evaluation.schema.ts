import type { Evaluation as PrismaEvaluation } from '@genfeedai/prisma';

export interface IScores {
  [key: string]: unknown;
}

export interface IEvaluationAnalysis {
  [key: string]: unknown;
}

export interface IEvaluationFlags {
  [key: string]: unknown;
}

export interface IExternalContent {
  [key: string]: unknown;
}

export interface IActualPerformance {
  [key: string]: unknown;
}

export interface IEvaluationReview {
  [key: string]: unknown;
}

export interface IEvaluationReviewerComment {
  [key: string]: unknown;
}

export interface EvaluationDocument extends PrismaEvaluation {
  actualPerformance?: IActualPerformance;
  analysis?: IEvaluationAnalysis;
  brand?: string | null;
  content?: string | null;
  evaluationType?: string | null;
  externalContent?: IExternalContent;
  flags?: IEvaluationFlags;
  organization?: string | null;
  overallScore?: number | null;
  review?: IEvaluationReview;
  reviewerComments?: IEvaluationReviewerComment[];
  scores?: IScores;
  status?: string | null;
  user?: string | null;
  [key: string]: unknown;
}

export type Evaluation = EvaluationDocument;
