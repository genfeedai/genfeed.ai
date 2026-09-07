/**
 * Cold-start plan seeding (#4511 Lane F): lets the caller preview and choose
 * what a content plan is grounded in — watched-advertiser research, followed
 * creators, extracted creative patterns and the brand's own imported history
 * — instead of always taking the top-N default.
 */

export type ContentPlanSeedDatasetConfidence =
  | 'none'
  | 'low'
  | 'medium'
  | 'high';

export interface IContentPlanSeedDataset {
  confidence: ContentPlanSeedDatasetConfidence;
  genfeedPosts: number;
  importedPosts: number;
  totalPosts: number;
}

export interface IContentPlanSeedAdvertiser {
  id: string;
  name: string;
  platform: string;
  adCount: number;
  topHeadline: string | null;
}

export interface IContentPlanSeedSource {
  id: string;
  platform: string;
  handle: string;
  displayName: string | null;
  sourceType: string;
  postCount: number;
}

export interface IContentPlanSeedPreview {
  dataset: IContentPlanSeedDataset;
  isColdStart: boolean;
  advertisers: IContentPlanSeedAdvertiser[];
  sources: IContentPlanSeedSource[];
  patternCount: number;
  importedPostCount: number;
}

/** Caller-chosen subset of cold-start seeds; forwarded on plan generation. */
export interface IContentPlanSeedSelection {
  advertiserIds?: string[];
  sourceIds?: string[];
  isImportedHistoryIncluded?: boolean;
  isPatternsIncluded?: boolean;
}
