export interface IHighlight {
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

export interface IHighlightDetectionResult {
  highlights: IHighlight[];
  model: string;
  tokensUsed: number;
}
