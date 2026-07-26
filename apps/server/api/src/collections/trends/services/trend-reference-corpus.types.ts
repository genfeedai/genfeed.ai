import type {
  TrendSourceClassification,
  TrendSourceItem,
} from '@api/collections/trends/interfaces/trend.interfaces';

export interface SyncTrendReferenceInput {
  id: string;
  mentions: number;
  platform: string;
  sourcePreview: TrendSourceItem[];
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  topic: string;
  viralityScore: number;
}

export interface TrendReferenceRecordData {
  authorHandle?: string;
  canonicalUrl: string;
  contentType: TrendSourceItem['contentType'];
  currentEngagementTotal: number;
  currentMetrics?: TrendSourceItem['metrics'];
  firstSeenAt: string;
  lastSeenAt: string;
  latestTrendMentions: number;
  latestTrendViralityScore: number;
  matchedTrendTopics: string[];
  mediaUrl?: string;
  platform: string;
  publishedAt?: string;
  sourceClassification?: TrendSourceClassification;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  text?: string;
  thumbnailUrl?: string;
  title?: string;
}
