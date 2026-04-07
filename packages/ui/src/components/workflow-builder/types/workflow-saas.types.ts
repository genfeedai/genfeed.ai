export type TrendPlatform =
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'youtube'
  | 'reddit';

export type ContentPreference = 'video' | 'image' | 'any';
export type ContentType = 'video' | 'image' | 'text' | 'audio';
export type TrendType = 'video' | 'hashtag' | 'sound' | 'topic';
export type CheckFrequency = '15min' | '30min' | '1hr' | '4hr' | 'daily';
export type MixMode = 'replace' | 'mix' | 'background';
export type InspirationStyle =
  | 'match_closely'
  | 'inspired_by'
  | 'remix_concept';
export type ContentStyle =
  | 'educational'
  | 'entertainment'
  | 'aesthetic'
  | 'storytelling'
  | 'tutorial'
  | 'review';
export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

interface BaseTrendNodeData {
  status?: string;
  error?: string | null;
}

export interface TrendHashtagInspirationNodeData extends BaseTrendNodeData {
  auto: boolean;
  contentPreference: ContentPreference;
  contentType: ContentType | null;
  hashtag: string | null;
  hashtagPostCount: number | null;
  hashtags: string[];
  platform: TrendPlatform;
  prompt: string | null;
  recommendedPlatform: TrendPlatform | null;
  sourceHashtag: string | null;
}

export interface TrendTriggerNodeData extends BaseTrendNodeData {
  checkFrequency: CheckFrequency;
  keywords: string[];
  lastTrendTopic: string | null;
  lastTriggeredAt: string | null;
  minViralScore: number;
  platform: TrendPlatform;
  trendType: TrendType;
}

export interface TrendVideoInspirationNodeData extends BaseTrendNodeData {
  aspectRatio: AspectRatio | null;
  auto: boolean;
  contentStyle: ContentStyle | null;
  duration: number | null;
  hashtags: string[];
  includeOriginalHook: boolean;
  inspirationStyle: InspirationStyle;
  minViralScore: number;
  platform: TrendPlatform;
  prompt: string | null;
  sourceTrendTitle: string | null;
  sourceTrendUrl: string | null;
  style: string | null;
}

export interface SoundOverlayNodeData extends BaseTrendNodeData {
  audioVolume: number;
  fadeIn: number;
  fadeOut: number;
  mixMode: MixMode;
  outputVideoUrl: string | null;
  processingProgress: number | null;
  soundUrl: string | null;
  videoUrl: string | null;
  videoVolume: number;
}

export interface TrendSoundInspirationNodeData extends BaseTrendNodeData {
  authorName: string | null;
  coverUrl: string | null;
  duration: number | null;
  growthRate: number | null;
  maxDuration: number | null;
  minUsageCount: number;
  soundId: string | null;
  soundName: string | null;
  soundUrl: string | null;
  usageCount: number | null;
}
