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

export interface EvaluationDocument extends PrismaEvaluation {
  _id: string;
  actualPerformance?: IActualPerformance;
  analysis?: IEvaluationAnalysis;
  brand?: string | null;
  content?: string | null;
  evaluationType?: string | null;
  externalContent?: IExternalContent;
  flags?: IEvaluationFlags;
  organization?: string | null;
  overallScore?: number | null;
  scores?: IScores;
  status?: string | null;
  user?: string | null;
  [key: string]: unknown;
}

export type Evaluation = EvaluationDocument;
