export type PatternType =
  | 'hook_formula'
  | 'cta_formula'
  | 'content_structure'
  | 'caption_formula'
  | 'visual_style';

export interface ICreativePatternExample {
  text: string;
  score: number;
  platform: string;
  source: 'ad' | 'organic';
}

export interface ICreativePattern {
  patternType: PatternType;
  label: string;
  description: string;
  formula: string;
  examples: ICreativePatternExample[];
  platform?: string;
  industry?: string;
  source: 'ad' | 'organic' | 'both';
  avgPerformanceScore: number;
  sampleSize: number;
  scope: 'public' | 'private';
  organization?: string;
  brand?: string;
  computedAt: Date;
  validUntil: Date;
  isDeleted: boolean;
}
