import type {
  EvaluationSeverity,
  EvaluationType,
  ExternalPlatform,
  IngredientCategory,
  Status,
} from '@genfeedai/enums';

export interface IEvaluation {
  id: string;
  organization: string; // ObjectId reference
  user: string; // ObjectId reference
  brand: string; // ObjectId reference
  contentType: IngredientCategory | 'article' | 'post';
  content: string; // ObjectId reference
  evaluationType: EvaluationType;
  status: Status; // PROCESSING, COMPLETED, FAILED
  overallScore?: number;
  scores?: IEvaluationScores;
  analysis?: IEvaluationAnalysis;
  flags?: IEvaluationFlags;
  externalContent?: IExternalContentData;
  actualPerformance?: IActualPerformance;
  review?: IEvaluationReview;
  reviewerComments?: IEvaluationReviewerComment[];
  createdAt: Date;
  updatedAt: Date;
}

export type EvaluationReviewDecision =
  | 'approved'
  | 'needs_changes'
  | 'neutral'
  | 'rejected';

export interface IEvaluationReview {
  reviewerId: string;
  reviewerScore?: number;
  comment?: string;
  decision?: EvaluationReviewDecision;
  tags?: string[];
  reviewedAt: string;
}

export interface IEvaluationReviewerComment {
  reviewerId: string;
  comment: string;
  decision?: EvaluationReviewDecision;
  createdAt: string;
}

export interface IEvaluationScores {
  technical: ITechnicalScores;
  brand: IBrandScores;
  engagement: IEngagementScores;
}

export interface ITechnicalScores {
  overall: number;
  resolution?: number;
  frameRate?: number;
  audioQuality?: number;
  audioSync?: number;
  formatting?: number;
  readability?: number;
  seoScore?: number;
}

export interface IBrandScores {
  overall: number;
  styleAlignment: number;
  messageAlignment: number;
  toneAlignment: number;
  visualConsistency?: number;
}

export interface IEngagementScores {
  overall: number;
  viralityPotential: number;
  emotionalAppeal: number;
  shareability: number;
  platformFit: number;
}

export interface IEvaluationAnalysis {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  aiModel: string;
}

export interface IEvaluationFlags {
  isFlagged: boolean;
  severity: EvaluationSeverity;
  reasons: string[];
}

export interface IExternalContentData {
  sourceUrl: string;
  platform: ExternalPlatform;
  downloadedUrl?: string;
  replicationInsights: string[];
}

export interface IActualPerformance {
  views: number;
  engagement: number;
  engagementRate: number;
  accuracyScore: number;
  syncedAt: Date;
}

export interface IEvaluationComparisonScoreBreakdown {
  brandScore?: number;
  engagementScore?: number;
  modelScore?: number;
  reviewerScore?: number;
  technicalScore?: number;
}

export interface IEvaluationComparisonRanking {
  rank: number;
  evaluationId: string;
  contentId: string | null;
  contentType: string | null;
  evaluationType?: EvaluationType | string;
  status?: Status | string;
  compositeScore: number;
  scoreBreakdown: IEvaluationComparisonScoreBreakdown;
  strengths: string[];
  weaknesses: string[];
  reviewerComment?: string;
  reviewedAt?: string;
  updatedAt: Date | string;
}

export interface IEvaluationComparisonResult {
  comparedAt: string;
  evaluationIds: string[];
  winnerEvaluationId?: string;
  rankings: IEvaluationComparisonRanking[];
}
