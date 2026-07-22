export type InstagramInspirationMediaType = 'all' | 'posts' | 'reels';
export type InstagramInspirationSort = 'latest' | 'top';
export type InstagramRemixMode =
  | 'inspired_by'
  | 'match_closely'
  | 'remix_concept';

export interface InstagramInspirationBrandContext {
  audience: string[];
  description?: string;
  hashtags: string[];
  id: string;
  label: string;
  messagingPillars: string[];
  organizationId: string;
  ownUsername?: string;
  style?: string;
  tone?: string;
  topics: string[];
}

export interface InstagramInspirationPost {
  captionSnippet?: string;
  comments: number;
  engagement: number;
  id: string;
  imageUrl?: string;
  isVideo: boolean;
  likes: number;
  matchedSeeds: string[];
  ownerUsername: string;
  permalink: string;
  publishedAt?: string;
  shortcode: string;
  videoUrl?: string;
  views: number;
}

export interface InstagramInspirationSignals {
  formats: string[];
  hooks: string[];
  pacing: string[];
  styles: string[];
}

export interface InstagramInspirationAccount {
  averageEngagement: number;
  latestPostAt?: string;
  matchedSeeds: string[];
  posts: InstagramInspirationPost[];
  score: number;
  username: string;
}

export interface InstagramInspirationListResult {
  accounts: InstagramInspirationAccount[];
  degraded: boolean;
  niche: string;
  seeds: string[];
  source: 'cache' | 'live';
}

export interface InstagramInspirationDetailResult {
  degraded: boolean;
  posts: InstagramInspirationPost[];
  signals: InstagramInspirationSignals;
  source: 'cache' | 'live';
  username: string;
}

export interface InstagramRemixWorkflowResult {
  brandId: string;
  prompt: string;
  reviewRequired: true;
  source: {
    ownerUsername: string;
    permalink: string;
    publishedAt?: string;
    shortcode: string;
  };
  status: 'draft';
  workflowId: string;
  workflowName: string;
}
