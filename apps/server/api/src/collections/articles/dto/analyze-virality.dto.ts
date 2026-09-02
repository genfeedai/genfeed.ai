export class AnalyzeViralityDto {
  // No body params - uses article ID from URL
}

export interface ViralityFactor {
  emotionalAppeal: number; // 0-100
  shareability: number; // 0-100
  readability: number; // 0-100
  seoScore: number; // 0-100
  trendAlignment: number; // 0-100
}

export interface ViralityPredictions {
  estimatedReach: number;
  estimatedShares: number;
  estimatedEngagement: number;
}

export interface ViralityAnalysis {
  score: number; // Overall virality score 0-100
  factors: ViralityFactor;
  predictions: ViralityPredictions;
  suggestions: string[]; // Recommendations to improve
  analyzedAt: Date;
}

export interface ViralityAnalysisResponse {
  articleId: string;
  analysis: ViralityAnalysis;
}
