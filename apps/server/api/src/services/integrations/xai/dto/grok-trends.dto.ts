export interface GrokTrendData {
  topic: string;
  mentions: number;
  growthRate: number;
  context: string;
  hashtags: string[];
  contentAngle: string;
}

export interface GrokTrendsResponse {
  trends: GrokTrendData[];
}
