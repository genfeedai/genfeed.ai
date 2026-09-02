export interface TrendKpi {
  label: string;
  value: string;
  change: string;
}

export interface TrendPrompts {
  video: string;
  image: string;
}

export interface TrendInsight {
  id: string;
  name: string;
  summary: string;
  platform: string;
  audience: string;
  timeframe: string;
  hashtags: string[];
  prompts: TrendPrompts;
  kpis: TrendKpi[];
}
