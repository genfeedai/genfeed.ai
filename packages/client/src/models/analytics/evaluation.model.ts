import type {
  EvaluationSeverity,
  EvaluationType,
  ExternalPlatform,
  IngredientCategory,
  Status,
} from '@genfeedai/enums';

export interface IEvaluation {
  id: string;
  organization: string;
  user: string;
  brand: string;
  contentType: IngredientCategory | 'article' | 'post';
  content: string;
  evaluationType: EvaluationType;
  status: Status;
  overallScore?: number;
  scores?: IEvaluationScores;
  analysis?: IEvaluationAnalysis;
  flags?: IEvaluationFlags;
  externalContent?: IExternalContentData;
  actualPerformance?: IActualPerformance;
  createdAt: Date;
  updatedAt: Date;
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

export class Evaluation implements IEvaluation {
  public declare id: string;
  public declare organization: string;
  public declare user: string;
  public declare brand: string;
  public declare contentType: IngredientCategory | 'article';
  public declare content: string;
  public declare evaluationType: EvaluationType;
  public declare status: Status;
  public declare overallScore?: number;
  public declare scores?: IEvaluationScores;
  public declare analysis?: IEvaluationAnalysis;
  public declare flags?: IEvaluationFlags;
  public declare externalContent?: IExternalContentData;
  public declare actualPerformance?: IActualPerformance;
  public declare createdAt: Date;
  public declare updatedAt: Date;

  constructor(data: Partial<IEvaluation> = {}) {
    Object.assign(this, data);
  }
}
